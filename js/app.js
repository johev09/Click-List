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
    $scope.searchstr = ""
    $scope.email = ""
    $scope.signedIn = bg.app.singedIn;
    $scope.profile = {
        name: "name",
        email: "name@domain.com",
        picture: "./bored.png"
    }
    $scope.tabHeaders = ["Received", "Sent", "Contacts"];

    $scope.send = () => {
        console.log($scope.email);
    }
    $scope.singIn = () => {
        popup.startAuth(true);
    }
    $scope.showTab = (index) => {
        $scope.selectedTabIndex = index;
    }
    $scope.contactClicked = (contact) => {
        $scope.email = contact.email;
    }
    $scope.showTab(0);

    const popup = {
        emailInput: $("#emailinput"),
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
        initUI: () => {
        },
        init: () => {
            popup.initUI();
            popup.initFirebase();
            if ($scope.signedIn) {
                popup.startAuth(false);
            }
        }
    }
    popup.init();
});

app.controller('contacts-controller', function ($scope) {
    $scope.contacts = bg.app.contacts;
    $scope.contactsMax = 10;

    $scope.loadMore = function () {
        $scope.contactsMax += 10;
    }
})

app.controller('tab-controller', function($scope) {
    $scope.tabFavicon = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    $scope.tabTitle = '';
    $scope.tabURL = '';
    
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
            $scope.tabFavicon = tab.favIconUrl;
        } else {
            // couldn't obtain favicon as a normal url, try chrome://favicon/url
            $scope.tabFavicon = 'chrome://favicon/' + link;
        }
        
        $scope.tabTitle = title;
        $scope.tabURL = link;
        $scope.$apply();
    });
})

app.directive('myPostRepeatDirective', function () {
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

        searchstr = searchstr.toLowerCase()
        angular.forEach(arr, function (c) {
            if (c.name.toLowerCase().contains(searchstr))
                res.push(c);
        })

        return res;
    }
})
app.filter('imgsrcFilter', function () {
    return function (src) {
        if (src) {
            return src + "&access_token=" + bg.app.token;
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




String.prototype.contains = function (substr) {
    return this.indexOf(substr) > -1;
}
