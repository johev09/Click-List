// Initialize Firebase
const config = {
    apiKey: "AIzaSyAviNF0i0UEg3dU6O91fQf47Y9tM--X53c",
    authDomain: "clicklist-ac4b2.firebaseapp.com",
    databaseURL: "https://clicklist-ac4b2.firebaseio.com",
    projectId: "clicklist-ac4b2",
    storageBucket: "clicklist-ac4b2.appspot.com",
    messagingSenderId: "747275165469"
};
firebase.initializeApp(config);

var app = {
    signedIn: false,
    user: {},
    from: [],
    to: [],
    links: {},
    token: null,
    emailToContact: {},
    contacts: [],
    retryTimeout: 2000,

    /******** QUICK CONTACTS *********/
    colors: ["yellowgreen", "crimson", "dodgerblue", "darkslategray"],
    quickContacts: [],
    quickContactsMax: 5,
    initQuickContacts: () => {
        app.getFromLocalStorage('quickContacts')
            .then(quickContacts => {
                if (quickContacts) {
                    app.quickContacts = quickContacts;
                    app.initContextMenus();
                }
            });
    },
    addToQuickContact: email => {
        var index = app.quickContacts.indexOf(email);
        if (index !== -1) {
            app.quickContacts.splice(index, 1);
        }
        app.quickContacts.push(email);
        app.quickContacts.splice(0, app.quickContacts.length - app.quickContactsMax);

        app.saveToLocalStorage('quickContacts', app.quickContacts)
            .then(app.initContextMenus);
    },
    clickedContextMenuOption: (email, url) => {
        /*// Opens Popup.html in new tab
        window.open(chrome.extension.getURL('popup.html'),
    "_blank", "width=550,height=200,location=0,resizable=0")*/

        app.getMetaFromURL(url)
            .then(meta => {
                var link = {
                    from: app.user.email,
                    to: email,
                    title: meta.title,
                    url: meta.url,
                    favicon: meta.favicon,
                    received: false,
                    opened: false
                };
                app.send(link, email);
            })
            .catch(app.printError);
    },
    initContextMenus: () => {
        console.log("creating context menus...");
        chrome.contextMenus.removeAll();
        app.quickContacts
            .slice()
            .reverse()
            .forEach(function (email) {
                var profile = app.getProfile(email);
                chrome.contextMenus.create({
                    title: profile.name,
                    contexts: ["link"],
                    onclick: (info, tab) => {
                        app.clickedContextMenuOption(email, info.linkUrl);
                    }
                });
            })
    },

    openGraphAPI: {
        URL: 'https://opengraph.io/api/1.0/site/',
        Key: '5961d07407efcb0b00a6ce71'
    },
    getMetaFromURL: url => {
        return new Promise((resolve, reject) => {
            console.log("getting meta data of", url);
            var getURL = app.openGraphAPI.URL + encodeURIComponent(url);
            $.get(getURL, {
                    "app_id": app.openGraphAPI.Key
                })
                .done(res => {
                    if (res && res.hybridGraph) {
                        var title, favicon;
                        if (res.hybridGraph.title) {
                            title = res.hybridGraph.title;
                        }
                        if (res.hybridGraph.favicon) {
                            favicon = res.hybridGraph.favicon;
                        }

                        var meta = {
                            title: title,
                            favicon: favicon,
                            url: url
                        };
                        resolve(meta);
                        console.log("got meta data!", meta);
                    } else {
                        reject("no hybridGraph on success response: " + url);
                    }
                })
                .fail(() => reject("failed to get metadata: " + url));
        });
    },
    getCurrentTab: () => {
        return new Promise(function (resolve, reject) {
            chrome.tabs.query({
                active: true, // Select active tabs
                currentWindow: true // In the current window
            }, function (tabs) {
                resolve(tabs[0]);
            });
        }).then(tab => {
            var favIcon;
            if (tab.favIconUrl && tab.favIconUrl != '' &&
                tab.favIconUrl.indexOf('chrome://favicon/') == -1) {
                // favicon appears to be a normal url
                favIcon = tab.favIconUrl;
            } else {
                // couldn't obtain favicon as a normal url, try chrome://favicon/url
                favIcon = 'chrome://favicon/' + link;
            }

            return {
                title: tab.title,
                url: tab.url,
                favIcon: favIcon
            };
        });
    },

    /******* LOCALSTORAGE UTILS *******/
    saveToLocalStorage: (key, value) => {
        return new Promise((resolve, reject) => {
            var save = {};
            save[key] = value;
            chrome.storage.local.set(save, () => {
                console.log(key + ' saved to LS!', value);
                resolve();
            });
        });
    },
    getFromLocalStorage: key => {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(key, items => {
                var value = null;
                if (key in items) {
                    value = items[key];
                }

                console.log(key + ' got from LS!', value);
                resolve(value);
            });
        });
    },

    /****** UNREAD NOTIFICATION ******/
    lastFromTimestamp: 0,
    unreadCount: 0,
    initLastFromTimestamp: () => {
        app.getFromLocalStorage('lastFromTimestamp')
            .then(timestamp => app.lastFromTimestamp = timestamp);
    },
    setLastFromTimestamp: from => {
        if ((from.timestamp > app.lastFromTimestamp)) {
            app.lastFromTimestamp = from.timestamp;
            if (!app.isPopupOpen()) {
                app.unreadCount += 1;
                app.showUnreadBadge();
                app.notifyLink(from);
            }
        }
    },
    showUnreadBadge: () => {
        chrome.browserAction.setBadgeText({
            text: '' + app.unreadCount
        });
    },
    hideUnreadBadge: () => {
        app.undreadCount = 0;
        app.saveToLocalStorage('lastFromTimestamp', app.lastFromTimestamp);

        chrome.browserAction.setBadgeText({
            text: ''
        });
    },
    showSendAnimation: () => {
        chrome.browserAction.setBadgeText({
            text: "Sent"
        });
        setTimeout(() => {
            if (!app.isPopupOpen() && app.unreadCount) {
                app.showUnreadBadge();
            } else {
                app.hideUnreadBadge();
            }
        }, 2000);
    },

    yupButton: {
        title: "Check out!",
        iconUrl: "./img/happy.png"
    },
    nopeButton: {
        title: "Later...",
        iconUrl: "./img/bored.png"
    },
    chime: new Audio('./audio/chime.mp3'),
    notifications: {},
    notifyLink: from => {
        app.refreshToken()
            .then(token => {
                var link = app.links[from.linkKey],
                    profile = app.getProfile(from.from);

                console.log("notifying... ", link, profile);
                chrome.notifications.create(null, {
                    type: "basic",
                    title: 'You have received a new Link!',
                    message: link.title,
                    contextMessage: link.url,
                    iconUrl: profile.picture,
                    buttons: [app.yupButton, app.nopeButton]
                }, function (id) {
                    console.log("notified!", link, profile);
                    app.notifications[id] = from.linkKey;
                    app.chime.play();
                });
            });
    },
    clickedNotification: notifid => {
        if (notifid in app.notifications) {
            var linkKey = app.notifications[notifid];
            app.openLink(linkKey);
            /*app.openedLink(linkKey);
            app.openURL(app.links[linkKey].url);*/
        }

        app.closedNotification(notifid);
    },
    clickedNotificationButton: (notifid, btnIndex) => {
        console.log("clicked", notifid, btnIndex);
        if (btnIndex === 0 &&
            notifid in app.notifications) {
            app.clickedNotification(notifid);
        }
    },
    closedNotification: (notifid, byuser) => {
        chrome.notifications.clear(notifid);
        delete app.notifications[notifid];
    },
    initChromeNotificationListeners: () => {
        chrome.notifications.onClicked.addListener(app.clickedNotification);
        chrome.notifications.onButtonClicked.addListener(app.clickedNotificationButton);
        chrome.notifications.onClosed.addListener(app.closedNotification);
    },
    openURL: url => {
        console.log("opening url...", url);
        chrome.tabs.create({
            url: url
        });
    },

    /****** PROFILE & CONTACT ******/
    defaultProfilePicture: './img/bored.png',
    unknownProfilePicture: './img/who.png',
    profile: {
        name: "name",
        email: "name@domain.com",
        picture: './img/bored.png'
    },
    getProfile: email => {
        var name, email, picture;
        if (email == app.user.email) {
            name = app.user.displayName;
            email = app.user.email;
            picture = app.user.photoURL;
        } else if (email in app.emailToContact) {
            var contact = app.emailToContact[email];
            name = contact.name;
            email = contact.email;
            picture = (contact.src === null ? null : contact.src +
                "&access_token=" + app.token);
        } else {
            name = email;
            email = email;
            picture = app.unknownProfilePicture;
        }
        return {
            name: name,
            email: email,
            picture: picture
        };
    },
    processContacts: (entries) => {
        console.log("processing contacts response...");
        entries.forEach(function (entry) {
            if (entry.gd$email) {
                var etag = entry.gd$etag,
                    contactID = null,
                    email = entry.gd$email[0].address,
                    name = null,
                    src = null,
                    phoneNumber = [];

                // contactID
                if (entry.id && entry.id.$t) {
                    var id = entry.id.$t;
                    contactID = id.substr(id.lastIndexOf('/') + 1);
                }

                // name
                if (entry.gd$name &&
                    entry.gd$name.gd$fullName &&
                    entry.gd$name.gd$fullName.$t) {
                    name = entry.gd$name.gd$fullName.$t;
                }

                // picture
                if (entry.link) {
                    entry.link.some(link => {
                        if (link.rel && link.rel === 'http://schemas.google.com/contacts/2008/rel#photo' &&
                            link.type && link.type === 'image/*') {
                            if (link.gd$etag) {
                                src = link.href;
                            }
                            return true;
                        }
                        return false;
                    });
                }

                //phone number
                if (entry.gd$phoneNumber) {
                    entry.gd$phoneNumber.forEach(number => {
                        if (number.rel &&
                            number.rel === 'http://schemas.google.com/g/2005#mobile' &&
                            number.$t) {
                            phoneNumber.push(number.$t);
                        }
                    });
                }

                if (!(email in app.emailToContact)) {
                    var contact = {
                        etag: etag,
                        contactID: contactID,
                        email: email,
                        name: name === null ? email : name,
                        src: src,
                        color: app.colors.getRandom(),
                        phoneNumber: phoneNumber
                    };
                    app.emailToContact[email] = contact;
                    app.contacts.push(contact);
                }
            }
        });

        console.log(app.contacts);
        app.reloadPopup();
    },
    initContacts: (token) => {
        console.log("requesting for contacts for: " + app.user.email);

        var api = "https://www.google.com/m8/feeds/contacts/default/full?alt=json&max-results=999";
        api += "&v=3.0";
        //url +="&orderby=lastmodified&sortorder=descending";

        var xhr = new XMLHttpRequest();
        xhr.open('GET', api);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.onload = function () {
            if (xhr.readyState == 4 && xhr.status == 200) {
                var response = JSON.parse(xhr.responseText);
                var entries = response.feed.entry;
                if (response && response.feed && response.feed.entry) {
                    app.processContacts(response.feed.entry);
                } else {
                    console.log("fetched contacts, got nothing");
                }
            }
        }
        xhr.onerror = function (err) {
            console.error("failed to fetch contacts", err);
            //            setTimeout(() => getAllContacts(token), app.retryTimeout);
        }
        xhr.send(null);
    },

    /******* LOGIN & TOKEN ********/
    authorizing: false,
    initFirebase: token => {
        // Listen for auth state changes.
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                app.user = user;
                app.profile = {
                    name: user.displayName,
                    email: user.email,
                    picture: user.photoURL
                };
                app.signedIn = true;
                app.setLinksListener();
                app.initContacts(token);
            } else {
                app.signedIn = false;
            }

            console.log('User state change detected from the Background script of the Chrome Extension:', user);
            app.updatePopup();
        });

        // Authrorize Firebase with the OAuth Access Token.
        var credential = firebase.auth.GoogleAuthProvider.credential(null, token);
        firebase.auth().signInWithCredential(credential).catch(function (error) {
            // The OAuth token might have been invalidated. Lets' remove it from cache.
            if (error.code === 'auth/invalid-credential') {
                chrome.identity.removeCachedAuthToken({
                    token: token
                }, function () {
                    popup.startAuth(false);
                });
            }
        });
    },
    gotAuthToken: token => {
        app.initFirebase(token);
    },
    startAuth: interactive => {
        return new Promise((resolve, reject) => {
            app.authorizing = true;
            // Request an OAuth token from the Chrome Identity API.
            chrome.identity.getAuthToken({
                interactive: !!interactive
            }, function (token) {
                app.authorizing = false;
                if (token) {
                    app.token = token;
                    resolve(token);
                } else if (chrome.runtime.lastError) {
                    if (chrome.runtime.lastError.message === 'Authorization page could not be loaded.') {
                        chrome.runtime.reload();
                    }
                    console.error(chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    console.error('The OAuth Token was null');
                    reject('The OAuth Token was null');
                }
            });
        });
    },
    refreshToken: () => {
        return app.startAuth(false);
    },

    /******* FIREBASE STUFF ********/
    getUserIdFromEmail: email => {
        var specialChars = ['\\.', '#', '\\$', '\\/', '\\[', '\\]'],
            sanitized = email;
        specialChars.forEach(char => {
            var re = new RegExp(char, 'g');
            sanitized = sanitized.replace(re, '');
        })
        var userId = sanitized.slice(0, sanitized.indexOf('@'));
        return userId;
    },
    getLinksRefKey: () => {
        return '/links';
    },
    getFromRefKey: email => {
        return '/froms/' + app.getUserIdFromEmail(email);
    },
    getToRefKey: email => {
        return '/tos/' + app.getUserIdFromEmail(email);
    },
    getRefKeyComments: linkKey => {
        return app.getLinksRefKey() +
            '/' + linkKey + '/comments';
    },


    deleteFrom: from => {
        console.log("deleting link from...", from);
        var fromRefKey = app.getFromRefKey(app.user.email) + '/' + from.key;
        var linkFromRefKey = app.getLinksRefKey() + '/' + from.linkKey + '/from';

        var updates = {};
        updates[fromRefKey] = null;
        updates[linkFromRefKey] = null;
        firebase.database().ref()
            .update(updates)
            .then(() => console.log("deleted link from!", from))
            .catch(app.printError);
    },
    deleteTo: to => {
        console.log("deleting link from...", to);
        var toRefKey = app.getToRefKey(app.user.email) + '/' + to.key;
        var linkToRefKey = app.getLinksRefKey() + '/' + to.linkKey + '/to';

        var updates = {};
        updates[toRefKey] = null;
        updates[linkToRefKey] = null;
        firebase.database().ref()
            .update(updates)
            .then(() => console.log("deleted link to!", to))
            .catch(app.printError);
    },
    openLink: linkKey => {
        app.openURL(app.links[linkKey].url);
        app.openedLink(linkKey);
    },
    openedLink: linkKey => {
        if (!app.links[linkKey].opened) {
            console.log('updating opened', linkKey);
            var refkey = app.getLinksRefKey() + '/' + linkKey + '/opened';

            firebase.database().ref(refkey)
                .set(true)
                .catch(app.printError);
        }
    },
    receivedLink: linkKey => {
        if (!app.links[linkKey].received) {
            console.log('updating received', linkKey);
            var refKey = app.getLinksRefKey() + '/' + linkKey + '/received';

            firebase.database().ref(refKey)
                .set(true)
                .catch(app.printError);
        }
    },
    addLink: linkKey => {
        return new Promise((resolve, reject) => {
            if (!(linkKey in app.links)) {
                var linksRefKey = app.getLinksRefKey();
                var linkRef = firebase.database().ref(linksRefKey + '/' + linkKey);

                //                app.links[linkKey] = {};
                linkRef.once('value', snapshot => {
                    console.log("added link", linkKey, snapshot.val());
                    resolve();

                    app.links[linkKey] = snapshot.val();
                    app.updatePopup();

                    if (app.links[linkKey].to == app.user.email) {
                        app.receivedLink(linkKey);
                    }

                    linkRef.on('child_added', data => {
                        console.log("added link child", linkKey, data.key, data.val());

                        app.links[linkKey][data.key] = data.val();
                        app.updatePopup();
                    });
                });
                linkRef.on('child_changed', data => {
                    console.log("changed link child", linkKey, data.key, data.val());

                    app.links[linkKey][data.key] = data.val();
                    app.updatePopup();
                });
                linkRef.on('child_removed', data => {
                    console.log("removed link child", linkKey, data.key, data.val());

                    app.links[linkKey][data.key] = null;

                    // if both from and to is deleted remove link
                    if (!app.links[linkKey].from &&
                        !app.links[linkKey].to) {
                        app.removeLink(linkKey);
                    }

                    app.updatePopup();
                });
            }
        });
    },
    removeLink: linkKey => {
        var linkRefKey = app.getLinksRefKey() + '/' + linkKey,
            linkRef = firebase.database().ref(linkRefKey);

        linkRef.off();
        linkRef.remove()
            .then(() => {
                delete app.links[linkKey];
                console.log("link removed", linkKey);
            })
            .catch(app.printError)
    },
    serialize: data => {
        return Object.assign({}, data.val(), {
            key: data.key,
            openComments: false
        });
    },
    addedFrom: data => {
        var from = app.serialize(data);
        app.from.push(from);
        app.addLink(from.linkKey)
            .then(() => app.setLastFromTimestamp(from));
        console.log("added from", from);
    },
    removedFrom: data => {
        var removed = app.from.filter(from => {
            return from.key !== data.key;
        });
        Array.prototype.splice.apply(app.from, [0, app.from.length].concat(removed));

        console.log("removed from", data.val());
        app.updatePopup();
    },
    addedTo: data => {
        var to = app.serialize(data);
        app.to.push(to);
        app.addLink(to.linkKey);
        console.log("added to", to);
    },
    removedTo: data => {
        var removed = app.to.filter(to => {
            return to.key !== data.key;
        });
        Array.prototype.splice.apply(app.to, [0, app.to.length].concat(removed));

        console.log("removed to", data.val());
        app.updatePopup();
    },
    setLinksListener: () => {
        var fromRefKey = app.getFromRefKey(app.user.email),
            fromRef = firebase.database().ref(fromRefKey);
        fromRef.on('child_added', app.addedFrom);
        //        fromRef.on('child_changed', app.updatedFrom);
        fromRef.on('child_removed', app.removedFrom);

        var toRefKey = app.getToRefKey(app.user.email),
            toRef = firebase.database().ref(toRefKey);
        toRef.on('child_added', app.addedTo);
        //        toRefKey.on('child_changed', app.updatedTo);
        toRef.on('child_removed', app.removedTo);
    },
    send: (link, email) => {
        return new Promise((resolve, reject) => {
            if (app.signedIn) {
                console.log("sending link...", link, "...to...", email);
                var linksRefKey = app.getLinksRefKey();
                var linkKey = firebase.database()
                    .ref(linksRefKey)
                    .push().key;

                var fromRefkey = app.getFromRefKey(email);
                var toRefkey = app.getToRefKey(app.user.email);

                var fromKey = firebase.database()
                    .ref(fromRefkey)
                    .push().key;
                var toKey = firebase.database()
                    .ref(toRefkey)
                    .push().key;

                var timestamp = new Date().getTime();

                var updates = {};
                updates[linksRefKey + '/' + linkKey] = link;
                updates[fromRefkey + '/' + fromKey] = {
                    timestamp: timestamp,
                    from: app.user.email,
                    linkKey: linkKey
                };
                updates[toRefkey + '/' + toKey] = {
                    timestamp: timestamp,
                    to: email,
                    linkKey: linkKey
                };

                firebase.database().ref()
                    .update(updates)
                    .then(() => {
                        app.showSendAnimation();
                        resolve()
                    })
                    .catch(err => reject(err));
            } else {
                reject("not signed in");
            }
        })
    },
    addComment: (linkKey, comment) => {
        console.log("adding comment...", comment,
            "to", app.links[linkKey]);

        var commentsRefKey = app.getRefKeyComments(linkKey),
            commentKey = firebase.database().ref(commentsRefKey).push().key;
        // putting key in data
        // since will need it in ng-repeat
        firebase.database()
            .ref(commentsRefKey + '/' + commentKey)
            .set({
                timestamp: new Date().getTime(),
                commenter: app.user.email,
                comment: comment,
                key: commentKey
            })
            .catch(app.printError);
    },
    deleteComment: (linkKey, commentKey) => {
        console.log("deleting comment...", commentKey, "of link", linkKey, );
        var commentRefKey = app.getRefKeyComments(linkKey) + '/' + commentKey;
        firebase.database()
            .ref(commentRefKey)
            .remove()
            .catch(app.printError);
    },

    /******* CONNECT ********/
    popup: null,
    setPopup: popup => {
        app.popup = popup;
    },
    isPopupOpen: () => {
        return app.popup !== null;
    },
    onMessage: msg => {},
    onConnect: port => {
        if (port.name == 'popup') {
            port.onDisconnect.addListener(app.onDisconnect);
            port.onMessage.addListener(app.onMessage);
        }
        //        console.log("connected", port);
    },
    onDisconnect: port => {
        if (port.name == 'popup') {
            app.popup = null;
            app.from.forEach(from => from.openComments = false);
            app.to.forEach(to => to.openComments = false);
        }
        //        console.log("disconnected", port);
    },
    updatePopup: () => {
        if (app.popup) {
            app.popup.update();
        }
    },
    reloadPopup: () => {
        if (app.popup) {
            app.popup.reload();
        }
    },

    /********* UTILS **********/
    printError: err => {
        console.error(err);
    },

    /********* INIT ************/
    initChromeEvents: () => {
        chrome.runtime.onConnect.addListener(app.onConnect);
        app.initChromeNotificationListeners();
    },
    init: () => {
        app.initLastFromTimestamp();
        app.initQuickContacts();
        app.initChromeEvents();

        app.startAuth(false)
            .then(app.gotAuthToken);
    }
}
app.init();

Array.prototype.getRandom = () => {
    return this[Math.floor(Math.random() * this.length)];
}
Array.prototype.remove = val => {
    var index = this.indexOf(val);
    if (index !== -1)
        this.splice(i, 1);
}

/*function isOnline() {
    if (!navigator.onLine) {
        wsclosed = true
        wsconnecting = false
        ws.close()
    }
    //console.log(navigator.onLine,closed,connecting)
    setTimeout(isOnline, 1000)
}
//isOnline()*/