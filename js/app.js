String.prototype.contains = function (substr) {
    return this.indexOf(substr) > -1;
}

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
    $scope.signedIn = bg.app.singedIn;
    $scope.profile = {
        name: "name",
        email: "name@domain.com",
        picture: "./bored.png"
    }
    
    $scope.singIn = () => {
        popup.startAuth(true);
    }

    const popup = {
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
        init: () => {
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
        }
    }
    popup.init();
});

app.controller('contacts-controller', function ($scope) {
    $scope.contacts = bg.contacts

    $scope.contactsMax = 10;

    $scope.loadMore = function () {
        $scope.contactsMax += 10;
    }
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
        return src == '' ? '' : src + "&access_token=" + bg.access_token;
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
