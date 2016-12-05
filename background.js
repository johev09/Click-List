var intranet_list = [
  "ws://52.33.207.145:5001"
]; // Make this configurable

var config = {
    mode: "direct",
};
chrome.proxy.settings.set({
    value: config,
    scope: "regular"
});

var gotdata = false,
    data,
    lastcount = 0,
    message;
var useremail;

var sentLinksBylid = {},
    receivedLinksBylid = {};
//var SERVER_URL = "http://click-list.esy.es/?";

var URL_WS = 'ws://52.33.207.145:5001';
//var URL_WS = 'ws://localhost:5001';

function getData(cb) {
    chrome.storage.local.get("data", function (items) {
        console.log(items);
        if (cb && "data" in items)
            cb(items.data)
    })
}

chrome.notifications.onButtonClicked.addListener(function (notifid, btnIndex) {
    chrome.notifications.clear(notifid)
    if (notifid in notifications) {
        if (btnIndex === 0) {
            linkOpened(notifications[notifid])
        } else if (btnIndex === 1) {}
    }
});

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

var data_lids = new Set();
var notifications = {};

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
        }

        if (!data_lids.has(link.lid)) {
            new_links.push(link)
        }
        new_data_lids.add(link.lid)
    })
    data_lids = new_data_lids

    if (data.length > lastcount) {
        chrome.browserAction.setBadgeText({
            text: "" + (data.length - lastcount)
        });

        getAuthToken(function (token) {
            notifications = {}
            new_links.forEach(function (link) {
                var title = "Unknown (" + link.sender + ")",
                    message = link.title,
                    iconUrl = ""

                if (link.sender in contact) {
                    var sender = contact[link.sender]
                    title = sender.name
                    iconUrl = sender.src + "&access_token=" + token
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

getData(function (localdata) {
    data = localdata
    lastcount = data.length
    saveData()
})

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
        if (cb)
            cb(token)
    })
}

function getUser(callback) {
    chrome.identity.getProfileUserInfo(function (userInfo) {
        var email = userInfo.email,
            id = userInfo.id;

        if (email == "") {
            showMessage("Please Sign in to Chrome");
        } else {
            useremail = email;
            callback(email, id);
        }
    });
}

var ws,
    wsconnecting = false,
    wsclosed = true;

function connectws() {
    wsconnecting = true
    write("trying to connectws...")
    getUser(function (email, id) {
        if (email == "") {
            //showMessage("Please Sign in to Chrome");
            return;
        }

        try {
            ws = new WebSocket(URL_WS, 'echo-protocol');
            write('Connecting... (readyState ' + ws.readyState + ')');
            ws.onopen = function (msg) {
                write('Connection successfully opened (readyState ' + this.readyState + ')');
                send({
                    type: "email",
                    data: email
                });
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
                    setTimeout(connectws, 1000)
                    write('Connection closed... The connection has been closed or could not be opened (readyState ' + this.readyState + ')');
                } else {
                    setTimeout(connectws, 1000)
                    write('Connection closed... (unhandled readyState ' + this.readyState + ')');
                }
                wsclosed = true
            };
            ws.onerror = function (event) {
                write("error: " + event.data);
            };
        } catch (exception) {
            write(exception);
        }
    })
}
connectws()

var contact = {};
var quickContacts = {};
var quickContactsEmails = [];
var maxContact = 5;

function addToQuickContact(email) {
    quickContactsEmails.remove(email)
    if (quickContactsEmails.length > maxContact) {
        quickContactsEmails.splice(0, 1)
    }

    quickContactsEmails.push(email)
    quickContacts[email] = contact[email]
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

function getAllContacts() {
    write("trying to get all contacts...")
    try {
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
                                src = "envelope.png";
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
                        }
                    });

                    console.log(contact);
                }
            }
            xhr.onerror = function (err) {
                console.error("xhr err", err);
                setTimeout(getAllContacts, 1000)
            }
            xhr.send();
        })
    } catch (err) {
        setTimeout(getAllContacts, 1000)
    }
}
getAllContacts()

function isOnline() {
    if (!navigator.onLine && !wsclosed) {
        wsclosed = true
        wsconnecting = false
        ws.close()
    }
    //console.log(navigator.onLine,closed,connecting)
    setTimeout(isOnline, 1000)
}
isOnline()

//chrome.commands.onCommand.addListener(function (command) {
//    console.log('Command:', command);
//});
//function refresh(callback) {
//    //console.log(chrome.extension.getBackgroundPage().data);
//    chrome.identity.getProfileUserInfo(function (userInfo) {
//        var email = userInfo.email,
//            uid = userInfo.id;
//
//        var xhr = new XMLHttpRequest();
//        xhr.onreadystatechange = function () {
//            if (xhr.readyState == 4 && xhr.status == 200) {
//                var response = xhr.responseText;
//                console.log(response);
//                var rjson = JSON.parse(response);
//                console.log(rjson);
//
//                if (rjson.success) {
//                    data = rjson.data;
//                    if (data.length > lastcount) {
//                        chrome.browserAction.setBadgeText({
//                            text: "" + (data.length - lastcount)
//                        });
//                    }
//                    lastcount = data.length;
//                }
//                gotdata = rjson.success;
//                message = rjson.message;
//
//                var views = chrome.extension.getViews({
//                    type: "popup"
//                });
//                if (views.length) {
//                    for (var i = 0; i < views.length; i++) {
//                        views[i].filldata();
//                    }
//                }
//
//                if (callback)
//                    callback();
//                //showMessage(rjson.message);
//            }
//        };
//
//        var url = SERVER_URL;
//        url += "action=refresh";
//        url += "&email=" + encodeURIComponent(email);
//        url += "&uid=" + uid;
//
//        xhr.open("GET", url, true);
//        xhr.send();
//    });
//}

//refresh();
//function poll() {
//    setTimeout(function () {
//        //alert("yo");
//        refresh(function() {
//            poll();
//        });
//    }, 3000);
//}