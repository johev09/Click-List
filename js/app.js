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