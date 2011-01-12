(function( $, GLOBAL ) {
    var _orig_find = $.fn.find;
    var _orig_bind = $.fn.bind;
    var _selector_analyzers = [];
    var _selectors = [];
    var _event_analyzers = [];
    var _dom_analyzers = [];


    function init() {
        enable();
        $(document).ready(initDOMAnalysis);
        $(document).ready(initButton);
    }


    function enable() {
        $.fn.bind = bindReplacement;
        $.fn.find = findReplacement;
    }


    function disable() {
        $.fn.bind = _orig_bind;
        $.fn.find = _orig_find;
    }


    function initDOMAnalysis() {
        disable();
        for (var i = 0; i < _dom_analyzers.length; i++) {
            var analyzer = _dom_analyzers[i];
            analyzer();
        }
        enable();
    }


    function findReplacement(selector) {
        var d1 = new Date().valueOf();
        var result = _orig_find.apply(this, arguments);
        var d2 = new Date().valueOf();

        _selectors.push({
            selector : selector,
            results  : result.length,
            duration : (d2 - d1)
        });

        // Execute all selector analyzers
        disable();
        for (var i = 0; i < _selector_analyzers.length; i++) {
            _selector_analyzers[i](selector, result, d1, d2);
        }
        enable();

        return result;
    }


    function bindReplacement(type, data, fn) {
        var d1 = new Date().valueOf();
        var result = _orig_bind.apply(this, arguments);
        var d2 = new Date().valueOf();

        // Execute all event analyzers
        disable();
        for (var i = 0; i < _event_analyzers.length; i++) {
            _event_analyzers[i](type, result, d1, d2);
        }
        enable();

        return result;
    }


    function initButton() {
        var button = $('<button>Show report</button>');
        button.css({
            position:'absolute',
            right:'1em',
            top:'1em',
            zIndex:1000
        });
        button.bind('click', addPerformanceLog);

        $('body').append(button);
    }


    function addPerformanceLog() {
        var results = {};
        for (var i = 0; i < _selectors.length; i++) {
            var item = _selectors[i];
            if (!results[item.selector]) {
                results[item.selector] = {
                    "Selector"       : item.selector,
                    "Results"        : item.results,
                    "Calls"          : 0,
                    "Total Duration" : 0
                };
            }

            var r = results[item.selector];
            r["Calls"] += 1;
            r["Total Duration"] += item.duration;
            r["Average Duration"] = Math.round(r["Total Duration"] / r["Calls"]);
        }

        if (!$.isEmptyObject(results)) {
            if (console.clear && confirm('Clear console?')) {
                console.clear();
            }
            if (console.table) {
                console.table(results);
            } else if (console.dir) {
                console.dir(results);
            }
        }
    }


    /*
     * Public Plugin Methods
     */
    $.analyze = {
        addDOMAnalyzer : function(selector, message) {
            function analyzer() {
                if ($(selector).length) {
                    console.warn('DOM warning:"', selector, '"');
                    console.log(message);
                }
            }

            _dom_analyzers.push(analyzer);
            return this;
        },

        addSelectorAnalyzer : function(analyzer) {
            _selector_analyzers.push(analyzer);
            return this;
        },

        addEventAnalyzer : function(analyzer) {
            _event_analyzers.push(analyzer);
            return this;
        }
    };


    init();
})(jQuery);


/* ################################################################
 * DEFAULT ANALYZERS
 * ################################################################ */
(function($) {
    $.analyze.addSelectorRegexp = function(rx, message) {

        function analyzer(selector) {
            var matches = selector.match(rx);
            if (matches) {
                console.warn('Selector warning:"', selector, '"');
                if ($.isFunction(message)) {
                    message(matches);
                } else {
                    console.log(message);
                }
            }
        }

        return $.analyze.addSelectorAnalyzer(analyzer);
    };

    $.analyze.addSelectorRegexp(/:[\w]+/, 'jQuery pseudo-selectors like :input are slow in IE');

    $.analyze.addSelectorRegexp(/^[\w]+#[\w]+/, 'Don\'t add elements to ID selectors');

    $.analyze.addSelectorRegexp(/^#[\w]+ #[\w]+/, 'Don\'t nest ID selectors');

    $.analyze.addSelectorRegexp(/^(#[\w]+) ([^>].+)/, function(matches) {
        //console.log('Don\'t follow ID selectors with other selectors. Use $("', matches[1], '").find("', matches[2], '") instead');
        console.log('Don\'t follow ID selectors with other selectors. Use $("%s").find("%s") instead', matches[1], matches[2]);
    });

    $.analyze.addSelectorRegexp(/^(#[\w]+) > (.+)/, function(matches) {
        console.log('Don\'t follow ID selectors with other selectors. Use $("%s").children("%s") instead', matches[1], matches[2]);
    });

    var _used_selectors = [];
    $.analyze.addSelectorAnalyzer(function(selector, result, d1, d2) {
        _used_selectors.push({
            selector:selector,
            results:result.length
        });
        var length = _used_selectors.length;
        if (length > 1) {
            var prev = _used_selectors[length - 2];
            if (prev.selector ===  selector && prev.results === result.length) {
                console.warn('Selector warning:"%s" used multiple times in a row. Consider caching', selector);
            }
        }
    });

    $.analyze.addEventAnalyzer(function(type, result, d1, d2) {
        if (result.length > 2) {
            console.warn('Event warning: Consider using delegate for "', type, '" on ', result);
        }
    });

    $.analyze.addDOMAnalyzer('form :input[name=submit], form :input[id=submit]', 'Don\'t name a form element "submit"');
})(jQuery);
