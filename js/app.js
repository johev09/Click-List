// Initialize Firebase
var config = {
    apiKey: "AIzaSyAviNF0i0UEg3dU6O91fQf47Y9tM--X53c",
    authDomain: "clicklist-ac4b2.firebaseapp.com",
    databaseURL: "https://clicklist-ac4b2.firebaseio.com",
    projectId: "clicklist-ac4b2",
    storageBucket: "clicklist-ac4b2.appspot.com",
    messagingSenderId: "747275165469"
};
firebase.initializeApp(config);

const bg = chrome.extension.getBackgroundPage();

var app = angular.module('popup', []);
//You need to explicitly add URL protocols to Angular's whitelist using a regular expression. 
//Only http, https, ftp and mailto are enabled by default.
//Angular will prefix a non-whitelisted URL with unsafe: when using a protocol such as chrome-extension:
app.config([
    '$compileProvider',
    function ($compileProvider)
    {
        //        $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|chrome-extension):/);
        $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension):/);
        // Angular before v1.2 uses $compileProvider.urlSanitizationWhitelist(...)
    }
]);
app.controller('popup-controller', function ($scope, $window) {
    $scope.comment = {};
    $scope.openSearch = false;
    $scope.emailToContact = bg.app.emailToContact;
    $scope.contacts = bg.app.contacts;
    $scope.quickContacts = bg.app.quickContacts;
    $scope.searchstr = '';
    $scope.email = '';
    $scope.signedIn = bg.app.signedIn;
    $scope.links = bg.app.links;
    $scope.from = bg.app.from;
    $scope.to = bg.app.to;
    $scope.profile = {
        name: "name",
        email: "name@domain.com",
        picture: bg.app.defaultProfilePicture
    }
    $scope.tabHeaders = [
        {
            name: "Received",
            obj: $scope.from
        },
        {
            name: "Sent",
            obj: $scope.to
        },
        {
            name: "Contacts",
            obj: $scope.contacts
        }];
    $scope.tab = {
        favicon: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        title: '',
        url: ''
    };

    /********* POPUP **********/
    const popup = {
        emailinput: $("#emailinput"),
        send: () => {
            var from = bg.app.user.email,
                to = $scope.email;

            var link = {
                from: from,
                to: to,
                title: $scope.tab.title,
                url: $scope.tab.url,
                favicon: $scope.tab.favicon,
                received: false,
                opened: false
            };

            bg.app.send(link, to)
                .then(() => {
                    bg.app.addToQuickContact(to);
                    popup.emailClear();
                })
                .catch(err => console.error(err));
        },
        contactClicked: contact => {
            $scope.email = contact.email;
            popup.emailinput.focus();
        },
        showTab: (index) => {
            $scope.selectedTabIndex = index;
        },
        gotToken: (token) => {
            // Authrorize Firebase with the OAuth Access Token.
            var credential = firebase.auth.GoogleAuthProvider.credential(null, token);
            firebase.auth().signInWithCredential(credential).catch(function (error) {
                // The OAuth token might have been invalidated. Lets' remove it from cache.
                if (error.code === 'auth/invalid-credential') {
                    chrome.identity.removeCachedAuthToken({
                        token: token
                    }, function () {
                        popup.startAuth(interactive);
                    });
                }
            });
        },
        startAuth: (interactive) => {
            // Request an OAuth token from the Chrome Identity API.
            chrome.identity.getAuthToken({
                interactive: interactive
            }, function (token) {
                if (chrome.runtime.lastError && !interactive) {
                    console.log('It was not possible to get a token programmatically.');
                } else if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                } else if (token) {
                    popup.gotToken(token);
                } else {
                    console.error('The OAuth Token was null');
                }
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
        renderEmailSuggestion: (ul, item) => {
            var listItem = $("<div/>", {
                class: 'list-item-div vertical-center'
            });

            var imgWrapper = $("<span/>", {
                class: 'link-simg-wrapper'
            })
            var initial = $("<span/>", {
                class: 'initial',
                text: item.name[0].toUpperCase()
            })
            imgWrapper.append(initial);
            var img = $("<img>", {
                class: 'link-simg suggestion-batched-image-loader',
                "data-img-loaded": "false",
            })
            if (item.src) {
                img.attr("src", withAccessToken(item.src));
            } else {
                img.addClass("ng-hide");
            }
            imgWrapper.append(img);

            var contactName = $("<p/>", {
                class: 'contact-name',
                text: item.name
            });
            var contactEmail = $("<p/>", {
                class: 'contact-email'
            });
            contactEmail.append($('<small>').text(item.email));

            var contactDetails = $("<div/>", {
                class: 'link-detail contact-details'
            });
            contactDetails.append(contactName, contactEmail);

            listItem.append(imgWrapper, contactDetails);

            return $("<li>", {
                    class: 'vertical-center'
                })
                .append(listItem)
                .appendTo(ul);
        },
        selectedEmailSuggestion: (email) => {
            $scope.email = email;
            $scope.$apply(() => {
                $scope.send();
            })
        },
        compareContact: (a, b) => {
            return a.name.localeCompare(b.name);
        },
        maxEmailSuggestion: 2,
        setupEmailSuggestion: () => {
            popup.emailinput
                .autocomplete({
                    minLength: 0,
                    source: (req, res) => {
                        if (req && req.term) {
                            // will first show results which starts with term
                            // and then results which contains term
                            var contactsStartsWith = [],
                                contactsContains = [];
                            $scope.contacts.forEach(contact => {
                                if (contact.email.startsWith(req.term) ||
                                    contact.name.startsWith(req.term)) {
                                    contactsStartsWith.push(contact);
                                } else if ((contact.email && contact.email.contains(req.term)) ||
                                    (contact.name && contact.name.contains(req.term))) {
                                    contactsContains.push(contact);
                                }
                            });
                            contactsStartsWith = contactsStartsWith.sort(popup.compareContact);
                            contactsContains = contactsContains.sort(popup.compareContact);
                            var suggestedContacts = contactsStartsWith.concat(contactsContains);

                            res(suggestedContacts.slice(0, popup.maxEmailSuggestion));
                        }
                    },
                    focus: (event, ui) => {},
                    select: (event, ui) => {
                        if (ui.item && ui.item.email) {
                            popup.selectedEmailSuggestion(ui.item.email)
                        }
                        return false;
                    }
                })
                .autocomplete("instance")
                ._renderItem = popup.renderEmailSuggestion;
        },

        signIn: () => {
            popup.startAuth(true);
        },
        emailClear: () => {
            $scope.email = '';
            $scope.$apply();
        },
        deleteFrom: from => {
            bg.app.deleteFrom(from);
        },
        deleteTo: to => {
            bg.app.deleteTo(to);
        },
        openURL: url => {
            chrome.tabs.create({
                url: url
            });
        },
        clickedLinkFrom: from => {
            bg.app.openURL($scope.links[from.linkKey].url);
            bg.app.openedLink(from.linkKey);
        },
        clickedLinkTo: to => {
            bg.app.openURL($scope.links[to.linkKey].url);
        },
        clickedQuickContact: qc => {
            $scope.email = qc;
            popup.send();
        },

        openComments: from => {
            from.openComments = !from.openComments;
        },
        addComment: linkKey => {
            bg.app.addComment(linkKey, $scope.comment[linkKey]);
            $scope.comment[linkKey] = '';
        },
        deleteComment: (linkKey, commentKey) => {
            bg.app.deleteComment(linkKey, commentKey);
        },
        watch: () => {
            //            $scope.$watch('from', loadProfilePictures, true);
            //            $scope.$watch('to', loadProfilePictures, true);
        },
        initUI: () => {
            popup.setupEmailSuggestion();
            popup.showTab(0);

            $scope.send = popup.send;
            $scope.signIn = popup.signIn;
            $scope.emailClear = popup.emailClear;
            $scope.showTab = popup.showTab;
            $scope.contactClicked = popup.contactClicked;

            $scope.clickedLinkFrom = popup.clickedLinkFrom;
            $scope.clickedLinkTo = popup.clickedLinkTo;
            $scope.deleteFrom = popup.deleteFrom;
            $scope.deleteTo = popup.deleteTo;
            $scope.clickedQuickContact = popup.clickedQuickContact;

            $scope.openComments = popup.openComments;
            $scope.addComment = popup.addComment;
            $scope.deleteComment = popup.deleteComment;
        },
        attachToBackground: () => {
            $scope.getProfile = bg.app.getProfile;

            bg.app.hideUnreadBadge();
            bg.app.refreshToken();
            bg.app.popup = popup;

            // connecting to background script
            // background script will receive event
            // on popup close
            chrome.runtime.connect({
                name: 'popup'
            });
        },
        initFirebase: () => {
            firebase.auth().onAuthStateChanged(function (user) {
                if (user) {
                    // User is signed in.
                    /*var displayName = user.displayName;
                    var email = user.email;
                    var emailVerified = user.emailVerified;
                    var photoURL = user.photoURL;
                    var isAnonymous = user.isAnonymous;
                    var uid = user.uid;
                    var providerData = user.providerData;*/

                    $scope.profile.name = user.displayName;
                    $scope.profile.email = user.email;
                    $scope.profile.picture = user.photoURL;
                } else {
                    console.log("signed out");
                }
                $scope.$apply();
            });
        },
        init: () => {
            popup.attachToBackground();
            popup.initUI();
            popup.watch();
            popup.initFirebase();
            if ($scope.signedIn) {
                popup.startAuth(false);
            }
        }
    }
    popup.init();
    $scope.popup = popup;
});

app.controller('contacts-controller', function ($scope) {
    $scope.contactsMax = 10;
    $scope.selectedContactIndex = 0;

    $scope.loadMore = function () {
        $scope.contactsMax += 10;
    }
})

app.controller('tab-controller', function ($scope) {
    setTimeout(() => {
        $scope.$parent.popup
            .getCurrentTab()
            .then(tab => {
                $scope.tab.title = tab.title;
                $scope.tab.url = tab.url;
                $scope.tab.favicon = tab.favIcon;
                $scope.$apply();
            })
    });
});

app.filter('reverse', function () {
    return function (items) {
        return items.slice().reverse();
    }
});
app.filter('searchContact', function () {
    return function (arr, searchstr) {
        if (!searchstr)
            return arr;

        var res = [];
        angular.forEach(arr, function (c) {
            if (c.name.contains(searchstr) ||
                c.email.contains(searchstr)) {
                res.push(c);
            }
        })

        return res;
    }
})
app.filter('searchLink', function () {
    return function (arr, searchstr) {
        if (!searchstr)
            return arr;

        var res = [];
        angular.forEach(arr, function (c) {
            var link = bg.app.links[c.linkKey];
            if (link.title.contains(searchstr) ||
                link.url.contains(searchstr) ||
                (c.from && c.from.contains(searchstr)) ||
                (c.to && c.to.contains(searchstr))) {
                res.push(c);
            }
        })

        return res;
    }
})
app.filter('accessToken', function () {
    return function (src) {
        if (src) {
            return src;
            /*if (src ===  bg.app.defaultProfilePicture ||
               src === bg.app.unknownProfilePicture) {
                return src;
            } else {
                return withAccessToken(src);
            }*/
        } else {
            //empty image
            return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        }
    }
});
app.filter('orderObjectBy', function () {
    return function (items, field, reverse) {
        var filtered = [];
        angular.forEach(items, function (item, key) {
            filtered.push(item);
        });
        filtered.sort(function (a, b) {
            return (a[field] > b[field] ? 1 : -1);
        });
        if (reverse) filtered.reverse();
        return filtered;
    };
});

app.directive('postRepeatDirective', function () {
    return function (scope, element, attrs) {
        if (scope.$last || scope.$first) {
            loadProfilePictures();
        }
    };
});
app.directive("whenScrolled", function () {
    return {
        restrict: 'A',
        link: function (scope, elem, attrs) {

            // we get a list of elements of size 1 and need the first element
            raw = elem[0];

            // we load more elements when scrolled past a limit
            elem.bind("scroll", function () {
                if (raw.scrollTop + raw.offsetHeight + 5 >= raw.scrollHeight) {
                    //                    scope.loading = true;

                    // we can give any function which loads more elements into the list
                    scope.$apply(attrs.whenScrolled);
                }
            });
        }
    }
});
app.directive('focusOn', ($parse) => {
    return (scope, element, attrs) => {

        scope.$watch(attrs.focusOn, focus => {
            console.log("focuse: ", focus);
            if (focus) {
                setTimeout(() => element.focus());
            }
        });
    };
});

function loadProfilePictures() {
    //    setTimeout(() => {
    console.log('loading profile pictures...');
    $('.batched-image-loader').batchedImageLoader({
        delay: 1000, // in msecs
        batchSize: 10, // size of each batch to load
        className: 'batched-image-loader' // class on images
    });
    //    });
}

function withAccessToken(src) {
    return src +
        "&access_token=" + bg.app.token;
}

String.prototype.contains = function (substr) {
    return substr &&
        this.toLowerCase().indexOf(substr.toLowerCase()) > -1;
}
