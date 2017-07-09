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
        app.saveToLocalStorage('lastFromTimestamp', app.lastFromTimestamp);

        chrome.browserAction.setBadgeText({
            text: ''
        });
    },

    yupButton: {
        title: "Check out!",
        iconUrl: "./img/happy.png"
    },
    nopeButton: {
        title: "Later...",
        iconUrl: "./img/bored.png"
    },
    chime: new Audio('chime.mp3'),
    notifications: {},
    notifyLink: from => {
        app.refreshToken()
            .then(token => {
                var link = app.links[from.linkKey],
                    profile = app.getProfile(from.from);

                console.log("notifying.... ", link, profile);

                var iconUrl = profile.picture ? profile.picture : 'pointing.png';
                chrome.notifications.create(null, {
                    type: "basic",
                    title: 'NEW LINK!!!',
                    message: link.title,
                    contextMessage: link.url,
                    iconUrl: iconUrl,
                    buttons: [app.yupButton, app.nopeButton]
                }, function (id) {
                    console.log("notified!", link, profile);
                    app.notifications[id] = link.url;
                    app.chime.play();
                });
            });
    },
    clickedNotification: notifid => {
        if (notifid in app.notifications) {
            app.openURL(app.notifications[notifid]);
        }

        app.closedNotification(notifid);
    },
    clickedNotificationButton: (notifid, btnIndex) => {
        console.log("clicked", notifid, btnIndex);
        if (btnIndex === 0 &&
            notifid in app.notifications) {
            app.openURL(app.notifications[notifid]);
        }

        app.closedNotification(notifid);
    },
    closedNotification: (notifid, byuser) => {
        chrome.notifications.clear(notifid);
        delete notifications[notifid]
    },
    initChromeNotificationListeners: () => {
        chrome.notifications.onClicked.addListener(app.clickedNotification);
        chrome.notifications.onButtonClicked.addListener(app.clickedNotificationButton);
        chrome.notifications.onClosed.addListener(app.closedNotification);
    },
    openURL: url => {
        console.log("opening tab", url);
        chrome.tabs.create({
            url: url
        });
    },

    /****** PROFILE & CONTACT ******/
    defaultProfilePicture: './img/bored.png',
    unknownProfilePicture: './img/who.png',
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
                        color: "dodgerblue",
                        phoneNumber: phoneNumber
                    };
                    app.emailToContact[email] = contact;
                    app.contacts.push(contact);
                }
            }
        });

        console.log(app.contacts);
    },
    getContacts: (token) => {
        app.token = token;
        console.log(token);
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
            setTimeout(() => getAllContacts(token), app.retryTimeout);
        }
        xhr.send(null);
    },
    refreshToken: () => {
        return app.getToken()
            .then(token => {
                app.token = token;
                return app.token;
            });
        //            .catch(app.printError);
    },
    getToken: () => {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({
                interactive: false
            }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (token) {
                    resolve(token);
                } else {
                    reject("failed to get token");
                }
            });
        });
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

                app.links[linkKey] = {};
                linkRef.once('value', snapshot => {
                    app.links[linkKey] = snapshot.val();
                    console.log("added link", linkKey, snapshot.val());
                    resolve();

                    if (app.links[linkKey].to == app.user.email) {
                        app.receivedLink(linkKey);
                    }

                    linkRef.on('child_added', data => {
                        app.links[linkKey][data.key] = data.val();
                        console.log("added link child", linkKey, data.key, data.val());
                    });
                });
                linkRef.on('child_changed', data => {
                    app.links[linkKey][data.key] = data.val();
                    console.log("changed link child", linkKey, data.key, data.val());
                });
                linkRef.on('child_removed', data => {
                    app.links[linkKey][data.key] = null;
                    console.log("removed link child", linkKey, data.key, data.val());

                    // if both from and to is deleted remove link
                    if (!app.links[linkKey].from &&
                        !app.links[linkKey].to) {
                        app.removeLink(linkKey);
                    }
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
                    .then(() => resolve())
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
            app.from.forEach(to => to.openComments = false);
        }
        //        console.log("disconnected", port);
    },

    /********* UTILS **********/
    printError: err => {
        console.error(err);
    },

    /********* INIT ************/
    initFirebase: () => {
        // Listen for auth state changes.
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                app.user = user;
                app.getToken()
                    .then(token => {
                        app.signedIn = true;
                        app.getContacts(token);
                    })
                    .catch(app.printError);

                app.setLinksListener();
            } else {
                app.signedIn = false;
            }

            console.log('User state change detected from the Background script of the Chrome Extension:', user);
        });
    },
    initChromeEvents: () => {
        chrome.runtime.onConnect.addListener(app.onConnect);
        app.initChromeNotificationListeners();
    },
    init: () => {
        app.initLastFromTimestamp();
        app.initQuickContacts();
        app.initChromeEvents();

        app.initFirebase();
    }
}
app.init();

var contact = {},
    contacts = [];

var gotdata = false,
    data,
    lastcount = 0,
    message;
var useremail;

var sentLinksBylid = {},
    receivedLinksBylid = {};

var defaultsrc = "envelope.png";
var defaultNotifyIcon = "pointing.png";
var chime = new Audio('chime.mp3')

var URL_WS = 'ws://52.33.207.145:5001';
//var URL_WS = 'ws://localhost:5001';

var data_lids = new Set();
var notifications = {};

var access_token;

function getAllContacts() {
    write("trying to get all contacts...")
    getAuthToken(function (token) {
        console.log(token);

        //var url = 'https://www.google.com/m8/feeds/contacts/default/thin?alt=json&max-results=10&orderby=lastmodified&sortorder=descending';
        var url = "https://www.google.com/m8/feeds/contacts/default/full?alt=json&max-results=999";
        url += "&v=3.0";
        //url +="&orderby=lastmodified&sortorder=descending";

        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.onload = function () {
            if (xhr.readyState == 4 && xhr.status == 200) {
                //console.log(xhr.responseText);
                var json = JSON.parse(xhr.responseText);
                var entries = json.feed.entry;
                entries.forEach(function (entry) {
                    if (entry.hasOwnProperty("gd$email")) {
                        var email = entry.gd$email[0].address,
                            name = "",
                            src = "";
                        if (entry.hasOwnProperty("gd$name")) {
                            name = entry.gd$name.gd$fullName.$t;
                        }
                        var links = entry.link;
                        links.some(function (link) {
                            if (link.type == "image/*") {
                                if (link.hasOwnProperty("gd$etag"))
                                    src = link.href; // + "&access_token=" + token;
                                return true;
                            }
                            return false;
                        });

                        contact[email] = {
                            name: name,
                            src: src,
                            color: "dodgerblue" //colors.getRandom()
                        };

                        contacts.push({
                            email: email,
                            name: name == "" ? email : name,
                            src: src,
                            color: "dodgerblue"
                        });
                    }
                });

                initContextMenus();
                console.log(contact);
            }
        }
        xhr.onerror = function (err) {
            console.error("xhr err", err);
            setTimeout(getAllContacts, 1000)
        }
        xhr.send();
    })
}
/*getAllContacts()*/

function getData(cb) {
    if (!cb)
        return
    chrome.storage.local.get("data", function (items) {
        console.log(items);
        if ("data" in items)
            cb(items.data)
        else
            cb([])
    })
}

function getQuickContacts(cb) {
    if (!cb)
        return
    chrome.storage.local.get("quickcontacts", function (items) {
        if ("quickcontacts" in items)
            cb(items.quickcontacts)
    })
}

function saveData() {

    // checking for new links
    var new_links = [],
        new_data_lids = new Set();
    data.forEach(function (link, i) {
        if (useremail && link.sender == useremail) {
            sentLinksBylid[link.lid] = data[i]
        }
        if (useremail && link.receiver == useremail) {
            receivedLinksBylid[link.lid] = data[i]

            if (!data_lids.has(link.lid)) {
                new_links.push(link)
            }
        }
        new_data_lids.add(link.lid)
    })
    data_lids = new_data_lids

    if (new_links.length) {
        chrome.browserAction.setBadgeText({
            text: "" + new_links.length
        });

        getAuthToken(function (token) {
            new_links.forEach(function (link) {
                var title = link.sender,
                    message = link.title,
                    iconUrl = ""

                if (link.sender in contact) {
                    var sender = contact[link.sender]
                    title = (sender.name == "" ? title : sender.name)
                    iconUrl = sender.src + "&access_token=" + token
                } else {
                    iconUrl = defaultNotifyIcon
                }

                chrome.notifications.create(null, {
                    type: "basic",
                    title: title,
                    message: message,
                    contextMessage: link.link,
                    iconUrl: iconUrl,
                    buttons: [{
                        title: "Check Link",
                        iconUrl: "happy.png"
                    }, {
                        title: "Later...",
                        iconUrl: "bored.png"
                    }]
                }, function (id) {
                    notifications[id] = link.lid
                    chime.play()
                })
            })
        })
    }

    // Save it using the Chrome extension storage API.
    chrome.storage.local.set({
        'data': data
    }, function () {
        // Notify that we saved.
        console.log('Settings saved');
    });
}

function saveQuickContacts(cb) {
    chrome.storage.local.set({
        'quickcontacts': quickContacts
    }, function () {
        // Notify that we saved.
        console.log('Quick Contacts saved');
    });

    initContextMenus();
}
/*getQuickContacts(function (qcontacts) {
    quickContacts = qcontacts

    saveQuickContacts()
})*/

function sendlinkto(receiver, link) {
    getUser(function (email, id) {
        getTitle(link, function (title) {
            var data = {
                lid: 0,
                sender: email,
                receiver: receiver,
                title: title,
                link: link,
                favicon: ""
            }

            send({
                type: "send",
                data: data
            });
        })
    });

    // adding receiver to quick contacts
    addToQuickContact(receiver)
}

function getTitle(url, cb) {
    if (!cb)
        return;
    url = "http://opengraph.io/api/1.0/site/" + url;
    $.get(url, function (res) {
        //console.log(res.hybridGraph.title);
        cb(res.hybridGraph.title)
    })
}

function initContextMenus() {
    chrome.contextMenus.removeAll();

    var reverse = quickContacts.slice(0).reverse();
    reverse.forEach(function (email) {
        var name = (email in contact && contact[email].name != "") ? contact[email].name : email //contact[email].name+" ("+email+")" : email
        chrome.contextMenus.create({
            title: name,
            contexts: ["link"],
            onclick: function (info, tab) {
                // Opens Popup.html in new tab
                //                window.open(chrome.extension.getURL('popup.html'),
                //                        "_blank", "width=550,height=200,location=0,resizable=0")
                sendlinkto(email, info.linkUrl)
            }
        });
    })
}

function notifLinkOpen(lid) {
    window.open(receivedLinksBylid[lid].link)
    linkOpened(lid)
}
chrome.notifications.onClicked.addListener(function (notifid) {
    chrome.notifications.clear(notifid)
    if (notifid in notifications) {
        notifLinkOpen(notifications[notifid])
    }
    delete notifications[notifid]
});
chrome.notifications.onButtonClicked.addListener(function (notifid, btnIndex) {
    chrome.notifications.clear(notifid)
    if (btnIndex === 0 && notifid in notifications) {
        notifLinkOpen(notifications[notifid])
    }
    delete notifications[notifid]
});
chrome.notifications.onClosed.addListener(function (notifid, byuser) {
    delete notifications[notifid]
})

function linkOpened(lid) {
    console.log(lid)
    var link = receivedLinksBylid[lid]
    link.opened = 1
    send({
        type: "opened",
        data: {
            lid: link.lid,
            sender: link.sender,
            receiver: link.receiver,
        }
    })
}

function write(text) {
    console.log(text);
}

function send(params) {
    console.log("sending", params);
    ws.send(JSON.stringify(params));
}

function getAuthToken(cb) {
    chrome.identity.getAuthToken({
        interactive: true
    }, function (token) {
        access_token = token;
        if (cb)
            cb(token)
    })
}

function getUser(callback) {
    chrome.identity.getProfileUserInfo(function (userInfo) {
        var email = userInfo.email,
            id = userInfo.id;

        if (email == "") {
            console.log("Please Sign in to Chrome...");
        } else {
            useremail = email;
            if (callback)
                callback(email, id);
        }
    });
}

var ws,
    wsconnecting = false,
    wsclosed = true;

function setProxy(cb) {
    var config = {
        mode: "direct",
    };
    chrome.proxy.settings.set({
        value: config,
        scope: "regular"
    }, function () {
        if (cb)
            cb();
    });
}

function clearProxy() {
    chrome.proxy.settings.clear({
        scope: "regular"
    })
}

function connectws() {
    getData(function (localdata) {
        data = localdata
        lastcount = data.length
        // data from storage is cached so keeping lids in old data_lids Set
        data.forEach(function (link, i) {
            data_lids.add(link.lid)
        })

        saveData()
        tryconnectws()
    })
}

function tryconnectws() {
    write("trying to connectws...")
    wsconnecting = true
    setProxy(function () {
        getUser(function (email, id) {
            ws = new WebSocket(URL_WS, 'echo-protocol');
            write('Connecting... (readyState ' + ws.readyState + ')');
            ws.onopen = function (msg) {
                write('Connection successfully opened (readyState ' + this.readyState + ')');
                send({
                    type: "email",
                    data: email
                });

                clearProxy()
                wsconnecting = false
                wsclosed = false
            };
            ws.onmessage = function (msg) {
                //write('Server says: ' + msg.data);

                var rjson = JSON.parse(msg.data);
                console.log(rjson);

                message = rjson.message;
                if (rjson.success) {
                    switch (rjson.action) {
                        case "deleted":
                        case "sent":
                            break
                        case "data":
                            gotdata = true
                            data = rjson.data

                            updatePopup()
                            saveData()
                    }
                }
            };
            ws.onclose = function (msg) {
                if (this.readyState == 2)
                    write('Closing... The connection is going throught the closing handshake (readyState ' + this.readyState + ')');
                else if (this.readyState == 3) {
                    clearProxy()
                    setTimeout(connectws, 1000)
                    write('Connection closed... The connection has been closed or could not be opened (readyState ' + this.readyState + ')');
                } else {
                    clearProxy()
                    setTimeout(connectws, 1000)
                    write('Connection closed... (unhandled readyState ' + this.readyState + ')');
                }
                wsclosed = true
            };
            ws.onerror = function (event) {
                console.error(event.data);
            };
        })
    })
}
/*connectws()*/

var quickContacts = [];
var maxContact = 5;

function addToQuickContact(email) {
    quickContacts.remove(email)
    if (quickContacts.length > maxContact) {
        quickContacts.splice(0, 1)
    }

    quickContacts.push(email)
    saveQuickContacts()
}

function updatePopup() {
    var views = chrome.extension.getViews({
        type: "popup"
    });
    if (views.length) {
        lastcount = data.length
        for (var i = 0; i < views.length; i++) {
            views[i].filldata();
        }
    }
}

var colors = ["#3e3e3e", "#ac2100", "#0032a3", "#6100b4", "#57048b"]
Array.prototype.getRandom = function () {
    var val = this[Math.floor(Math.random() * this.length)]
    console.log(val)
    return val
}
Array.prototype.remove = function (val) {
    var i = this.indexOf(val);
    if (i > -1)
        this.splice(i, 1)
    return this
}

function isOnline() {
    if (!navigator.onLine && !wsclosed) {
        wsclosed = true
        wsconnecting = false
        ws.close()
    }
    //console.log(navigator.onLine,closed,connecting)
    setTimeout(isOnline, 1000)
}
//isOnline()
