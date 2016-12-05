//var SERVER_URL="http://localhost/click-list/?";
//var SERVER_URL = "http://globaljutebags.in/click_list/?",
var bg;

function showMessage(text) {
    document.getElementById('message').innerHTML = text;
}

var tabtitle,
    taburl;

var $linkswrapper = null,
    $link = null;

var $emailform,
    $emailinput,
    $emailsubmit,
    $received,
    $sent,
    emailinput,
    $btns,
    ajaxtimeout,
    toms = 200;

document.addEventListener('DOMContentLoaded', function () {
    //console.log(chrome.extension);
    bg = chrome.extension.getBackgroundPage();
    chrome.browserAction.setBadgeText({
        text: ""
    });

    getTab(function (title, link, favicon) {
        tabtitle = title;
        taburl = link;

        $("#tab-title").html(tabtitle);
        $("#tab-url").html(taburl);

        //console.log(favicon,favicon.startsWith("chrome://"));

        var favimg = $("#tab-favicon img");
        if (favicon && (!favicon.startsWith("chrome://theme"))) {
            favimg.css("visibility", "visible")
            favimg.attr("src", favicon);
        } else {
            favimg.css("visibility", "hidden")
        }
    });
    bg.getUser(function (email, id) {});

    var sendbtn = document.getElementById("send");
    sendbtn.onclick = send;

    //    var refreshbtn = document.getElementById("refresh");
    //    refreshbtn.onclick = refresh;

    $btns = $("#btns");
    $emailform = $("#email-form");
    $emailform.submit(function (ev) {
        var receiver = $emailinput.val().trim()
        submitForm(receiver)

        ev.preventDefault()
        return false
    });
    $emailinput = $("#emailinput")
    $emailinput.on('keyup', emailkeyup)
    $emailinput.on('blur', closeEmail)
    $emailsubmit = $("#emailsubmit")

    var $linkstab = $("#links-tab")
    $received = $linkstab.children(".received")
    $sent = $linkstab.children(".sent")
    $received.click(changetab)
    $sent.click(changetab)

    $linkswrapper = $("#links-wrapper")
    $lwReceived = $linkswrapper.children(".lw-received")
    $lwSent = $linkswrapper.children(".lw-sent")

    $link = $linkswrapper.find(".link")
    $link.remove();

    setTimeout(filldata);
});

function changetab() {
    $received.toggleClass("selected")
    $sent.toggleClass("selected")
    $lwReceived.toggleClass("hide")
    $lwSent.toggleClass("hide")
}

function emailkeyup(ev) {
    //close on Esc
    if (ev.keyCode == 27) {
        closeEmail();
        return;
    }
    if (ev.key.length != 1)
        return;

    clearTimeout(ajaxtimeout);
    ajaxtimeout = setTimeout(function () {
        $emailinput.autocomplete({
            minLength: 0,
            source: []
        });

        var q = $emailinput.val();
        bg.getAuthToken(function (token) {
            console.log("token: " + token);

            var url = "https://www.google.com/m8/feeds/contacts/default/thin?";
            url += "alt=json";
            url += "&max-results=10";
            url += "&orderby=lastmodified&sortorder=descending";
            url += "&q=" + q;
            url += "&v=3.0";

            var xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.onload = function () {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    //console.log(xhr.responseText);
                    var json = JSON.parse(xhr.responseText);
                    if (!json.feed.hasOwnProperty("entry"))
                        return;

                    var emails = [];
                    var entries = json.feed.entry;
                    entries.forEach(function (entry, i) {
                        if (entry.hasOwnProperty("gd$email")) {
                            //console.log(entry.gd$email[0].address);
                            emails.push(entry.gd$email[0].address);
                        }
                    });
                    $emailinput.autocomplete({
                        minLength: 0,
                        source: emails,
                        select: function (event, ui) {
                            var label = ui.item.label;
                            var value = ui.item.value;
                            //store in session
                            submitForm(value)
                        }
                    });
                    $emailinput.autocomplete("search", "");
                }
            }
            xhr.send();
        })


        //        chrome.identity.getAuthToken({
        //            interactive: true
        //        }, function (token) {
        //            
        //        });

    }, toms);
}

function filldata() {
    if (bg.gotdata) {
        bg.getAuthToken(function (token) {
            var data = bg.data;
            bg.lastcount = data.length

            $lwReceived.children().remove();
            $lwSent.children().remove();

            data.forEach(function (row, i) {
                addtoList(token, row, i)
            })
        })
    } else {
        console.log("data err", bg.data);
        console.log(bg.message);
    }
}

function addtoList(token, row, i) {
    var $nlink = $link.clone(true, true),
        $linksimgwrapper = $nlink.children(".link-simg-wrapper"),
        $linksimg = $linksimgwrapper.children(".link-simg"),
        $initial = $linksimgwrapper.children(".initial"),
        $linkdetail = $nlink.children(".link-detail"),
        $linkurl = $linkdetail.children(".link-url"),
        $linkdel = $nlink.children(".link-delete"),
        $linkextra = $nlink.children(".link-extra"),
        $linkreceived = $linkextra.children(".received"),
        $linkopened = $linkextra.children(".opened")

    if (row.sender in bg.contact) {
        var contact = bg.contact[row.sender],
            src = contact.src + "&access_token=" + token,
            name = ("name" in contact && contact.name != "") ? contact.name + "(" + row.sender + ")" : row.sender;

        $initial.text(name[0].toUpperCase())

        $linksimg
            .attr("src", src)
            .attr("title", name);
        $linksimgwrapper.css("background-color", contact.color)
    } else {
        $initial.text(row.sender[0].toUpperCase())
        $linksimg.remove();
    }
    $linksimgwrapper.attr("title", row.sender)

    var a = $("<a>", {
        target: "_blank",
        href: row.link,
        html: row.title
    })
    var lid = row.lid
    a.on('click', function () {
        bg.linkOpened(lid)
        return true
    })
    $linkurl.html("");
    $linkurl.append(a);
    $linkurl.attr("title", row.link);

    $linkdel.data("lid", row.lid);
    $linkdel.click(function () {
        //console.log($(this).data("lid"));
        $nlink.addClass("deleting");
        dellink($(this).data("lid"));
    });

    //========== LINK EXTRA =============
    if (bg.useremail) {
        //========SENT LIST
        if (row.sender == bg.useremail) {
            var $nlinksent = $nlink.clone(true, true);

            if (row.receiver in bg.contact) {
                //img of receiver
                var $nlinksentImgWrapper = $nlinksent.children(".link-simg-wrapper"),
                    $nlinksentImg = $nlinksentImgWrapper.children(".link-simg"),
                    $nlinksentInitial = $nlinksentImgWrapper.children(".initial")

                var contact = bg.contact[row.receiver],
                    src = contact.src + "&access_token=" + token,
                    name = ("name" in contact && contact.name != "") ? contact.name + "(" + row.sender + ")" : row.sender;
                $nlinksentInitial.text(name[0].toUpperCase())
                $nlinksentImg
                    .attr("src", src)
                    .attr("title", name);
                $nlinksentImgWrapper.css("background-color", contact.color)
            }

            $nlinksent.children(".link-delete").remove()
            var $nlinksentExtra = $nlinksent.children(".link-extra")
            if (row.received)
                $nlinksentExtra.children(".received").addClass("yes")
            if (row.opened)
                $nlinksentExtra.children(".opened").addClass("yes")

            $lwSent.append($nlinksent);
        }

        //========RECEIVED LIST
        if (row.receiver == bg.useremail) {
            $linkreceived.remove()
            if ("opened" in row && row.opened)
                $linkopened.addClass("yes")
            $lwReceived.append($nlink);
        }
    }

    return $nlink
}

function addtoRetryList(data) {
    // add to send for retry option
    bg.getAuthToken(function (token) {
        var $nlink = addtoList(token, data)
            //bg.retrylist[data.lid] = $nlink;
    })
}

function refresh() {
    bg.refresh(function () {
        filldata();
    });
}

function dellink(lid) {
    bg.getUser(function (email, id) {
        bg.send({
            type: "delete",
            data: {
                lid: lid,
                email: email,
                sender: bg.receivedLinksBylid[lid].sender,
                id: id
            }
        });
    });
}

function getTab(callback) {
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, function (tabs) {
        var tab = tabs[0],
            link = tab.url,
            title = tab.title;

        var favicon = null;
        if (tab.favIconUrl && tab.favIconUrl != '' &&
            tab.favIconUrl.indexOf('chrome://favicon/') == -1) {
            // favicon appears to be a normal url
            favicon = tab.favIconUrl;
            delay = 0;
        } else {
            // couldn't obtain favicon as a normal url, try chrome://favicon/url
            favicon = 'chrome://favicon/' + link;
            delay = 100; // larger values will probably be more reliable
        }

        callback(title, link, favicon);
    });
}

function sendlinkto(receiver) {
    bg.getUser(function (email, id) {
        getTab(function (title, link, favicon) {
            //getSnapShot(function (imgdata) {
            //console.log(imgdata)
            var data = {
                lid: getRandom(),
                sender: email,
                receiver: receiver,
                title: title,
                link: link,
                favicon: favicon
            }
            bg.send({
                type: "send",
                data: data
            });

            addtoRetryList(data)
        });
    });
}

function getRandom() {
    return Math.floor(Math.random() * 100000);
}

function send() {
    $emailinput.removeAttr("disabled")
    $emailinput.val("")

    $emailsubmit.removeAttr("disabled")

    $btns.addClass("invisible");
    //$emailinput.focus();
    setTimeout(function () {
        $emailinput.focus();
    }, 300);
}

function submitForm(receiver) {
    closeEmail()

    if (receiver != "") {
        console.log(receiver)
        sendlinkto(receiver)
    }
}

function closeEmail() {
    $btns.removeClass("invisible")
    $emailform.attr("disabled", true)
    $emailsubmit.attr("disabled", true)
    $(".ui-menu-item").hide()
}

function getSnapShot(cb) {
    if (!cb)
        return
    chrome.tabs.captureVisibleTab(null, {
        "format": "png",
        "quality": 50
    }, function (datauri) {
        var image = new Image()
        image.onload = function () {
            var canvas = document.createElement('canvas'),
                ctx = canvas.getContext('2d');

            // set its dimension to target size
            canvas.width = 250;
            canvas.height = 150;

            // draw source image into the off-screen canvas:
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            // encode image to data-uri with base64 version of compressed image
            cb(canvas.toDataURL())
        }
        image.src = datauri;
    });
}