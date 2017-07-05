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
    $scope.searchstr = '';
    $scope.email = '';
    $scope.signedIn = bg.app.singedIn;
    $scope.profile = {
        name: "name",
        email: "name@domain.com",
        picture: "./bored.png"
    }
    $scope.tabHeaders = ["Received", "Sent", "Contacts"];
    $scope.tab = {
        favicon: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        title: '',
        url: ''
    };

    $scope.send = () => {
        popup.send({
            title: $scope.tab.title,
            url: $scope.tab.url,
            favicon: $scope.tab.favicon
        }, $scope.email);

        $scope.emailClear();
    }
    $scope.signIn = () => {
        popup.startAuth(true);
    }
    $scope.emailClear = () => {
        $scope.email = '';
    }
    $scope.showTab = (index) => {
        $scope.selectedTabIndex = index;
    }
    $scope.contactClicked = (contact) => {
        $scope.email = contact.email;
        popup.emailinput.focus();
    }
    $scope.showTab(2);
    
    const popup = {
        emailinput: $("#emailinput"),
        send: (link, to) => {
            bg.app.send(link, to)
                .then(() => console.log("success"))
                .catch(err => console.log(err));
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
                    popup.gotToken(token)
                } else {
                    console.error('The OAuth Token was null');
                }
            });
        },
        initFirebase: () => {
            firebase.auth().onAuthStateChanged(function (user) {
                if (user) {
                    // User is signed in.
                    var displayName = user.displayName;
                    var email = user.email;
                    var emailVerified = user.emailVerified;
                    var photoURL = user.photoURL;
                    var isAnonymous = user.isAnonymous;
                    var uid = user.uid;
                    var providerData = user.providerData;

                    $scope.signedIn = true;
                    $scope.profile.name = displayName;
                    $scope.profile.email = email;
                    $scope.profile.picture = photoURL;
                } else {
                    console.log("signed out");
                    $scope.signedIn = false;
                }
                $scope.$apply();
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
                img.attr("src", getProfilePictureSrc(item.src));
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
        setupEmailSuggestion: () => {
            popup.emailinput
                .autocomplete({
                    minLength: 0,
                    source: (req, res) => {
                        if (req && req.term) {
                            var suggestedContacts = bg.app.contacts.filter(contact => {
                                return (contact.email && contact.email.contains(req.term)) ||
                                    (contact.name && contact.name.contains(req.term));
                            });
                            suggestedContacts = suggestedContacts.sort((a, b) => {
                                return a.name.localeCompare(b.name);
                            });
                            res(suggestedContacts.slice(0, 4));
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
        initUI: () => {
            popup.setupEmailSuggestion();
        },
        init: () => {
            bg.app.refreshToken();
            popup.initUI();
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
    $scope.contacts = bg.app.contacts;
    $scope.contactsMax = 10;
    $scope.selectedContactIndex = 0;

    $scope.loadMore = function () {
        $scope.contactsMax += 10;
    }
    $scope.printIndex = (index) => {
        console.log(index);
    }

    /*const keys = {
        UP: 38,
        DOWN: 40
    };

    document.onkeydown = e => {
        e = e || window.event;
        switch (e.keyCode) {
            case keys.UP:
                break;
            case keys.DOWN:
                break;
        }
    }*/
})

app.controller('tab-controller', function ($scope) {

    setTimeout(() => {
        $scope.$parent
            .popup
            .getCurrentTab()
            .then(tab => {
                $scope.tab.title = tab.title;
                $scope.tab.url = tab.url;
                $scope.tab.favicon = tab.favIcon;
                $scope.$apply();
            })
    });
})

app.directive('postRepeatDirective', function () {
    return function (scope, element, attrs) {
        if (scope.$last) {
            $('.batched-image-loader').batchedImageLoader({
                delay: 1000, // in msecs
                batchSize: 10, // size of each batch to load
                className: 'batched-image-loader' // class on images
            });
        }
    };
});
app.filter('searchContact', function () {
    return function (arr, searchstr) {
        var res = [];

        if (searchstr === undefined ||
            searchstr === '')
            return arr;

        searchstr = searchstr.toLowerCase();
        angular.forEach(arr, function (c) {
            if (c.name.contains(searchstr) ||
                c.email.contains(searchstr)) {
                res.push(c);
            }
        })

        return res;
    }
})

app.filter('imgsrcFilter', function () {
    return function (src) {
        if (src) {
            return getProfilePictureSrc(src);
        } else {
            //blank transparent gif
            return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        }
    }
})

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



function getProfilePictureSrc(src) {
    return src +
        "&access_token=" + bg.app.token;
}

String.prototype.contains = function (substr) {
    return substr &&
        this.toLowerCase().indexOf(substr.toLowerCase()) > -1;
}
