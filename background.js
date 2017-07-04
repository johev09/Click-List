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
    token: null,
    emailToContact: {},
    contacts: [],
    retryTimeout: 2000,
    processContacts: (entries) => {
        console.log("processing contacts response...");
        entries.forEach(function (entry) {
            if (entry.hasOwnProperty("gd$email")) {
                var email = entry.gd$email[0].address,
                    name = null,
                    src = null;

                if ("gd$name" in entry) {
                    name = entry.gd$name.gd$fullName.$t;
                }

                var links = entry.link;
                links.some(function (link) {
                    if (link.type === "image/*") {
                        if ("gd$etag" in link) {
                            src = link.href; // + "&access_token=" + token;
                        }
                        return true;
                    }
                    return false;
                });

                if (!(email in app.emailToContact)) {
                    var contact = {
                        email: email,
                        name: name === null ? email : name,
                        src: src,
                        color: "dodgerblue"
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
    getToken: (cb) => {
        if (!cb) return;

        chrome.identity.getAuthToken({
            interactive: false
        }, (token) => {
            if (token) {
                cb(token);
            }
        });
    },
    init: () => {
        // Listen for auth state changes.
        firebase.auth().onAuthStateChanged(function (user) {
            if (user) {
                app.signedIn = true;
                app.user = user;
                app.getToken(app.getContacts);
            } else {
                app.signedIn = false;
            }

            console.log('User state change detected from the Background script of the Chrome Extension:', user);
        });
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
