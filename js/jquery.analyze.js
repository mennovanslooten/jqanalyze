(function( $ ) {
    var _orig_find = $.fn.find;
    var _orig_bind = $.fn.bind;
    var _selectors = [];
    var _selector_analyzers = [];
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
        addDOMAnalyzer : function(analyzer) {
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
        },

        warn : function(warning, moreinfo) {
            console.group(warning);
            //console.warn.call(console, warning);
            if (moreinfo) {
                console.log(moreinfo);
            }
            console.groupEnd();
        }
    };


    init();
})(jQuery);


/* ################################################################
 * DEFAULT ANALYZERS
 * ################################################################ */
(function($) {
    /*
     * This method is used for some generic, regular-expression based selector
     * testing.
     */
    $.analyze.addSelectorRegexp = function(rx, message) {

        function analyzer(selector) {
            var matches = selector.match(rx);
            if (matches) {
                $.analyze.warn('Selector warning:"' + selector + '"', selector.replace(rx, message));
            }
        }

        return $.analyze.addSelectorAnalyzer(analyzer);
    };

    $.analyze.addSelectorRegexp(/:[\w]+/, 'jQuery pseudo-selectors like :input are slow in IE');

    $.analyze.addSelectorRegexp(/^[\w]+#[\w]+/, 'Don\'t add elements to ID selectors');

    $.analyze.addSelectorRegexp(/^#[\w]+ #[\w]+/, 'Don\'t nest ID selectors');

    $.analyze.addSelectorRegexp(/^(#[\w]+) ([^>].+)/, 'Don\'t follow ID selectors with other selectors. Use $("$1").find("$2") instead');

    $.analyze.addSelectorRegexp(/^(#[\w]+) > (.+)/, 'Don\'t follow ID selectors with other selectors. Use $("$1").children("$2") instead');


    /*
     * This analyzer tests if a selector is used multiple times in a row and
     * yields similar results. If so, suggest storing the result in a variable.
     */
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
                $.analyze.warn('Selector warning:"' + selector + '" used multiple times in a row.', 'If you use a selector multiple times in a row, you are probably better off storing it in a variable');
            }
        }
    });


    /*
     * This analyzer tests if an event is bound to multiple elements and if so,
     * suggest delegation.
     */
    $.analyze.addEventAnalyzer(function(type, result, d1, d2) {
        if (result.length > 2) {
            $.analyze.warn('Event warning: handler bound to ' + result.length + ' elements', 'A "' + type + '" handler was bound to $("' + result.selector + '") which returned ' + result.length + ' results. Events bound to multiple similar elements can sometimes be optimized with event delegation.');
            //console.warn('Event warning: Consider using delegate for "', type, '" on ', result.selector);
        }
    });


    /*
     * This analyzer tests is a form element exists with the name or id
     * "submit".
     */
    $.analyze.addDOMAnalyzer(function() {
        var baaaaad = $('form :input[name=submit], form :input[id=submit]');
        if (baaaaad.length) {
            $.analyze.warn('DOM warning: Don\'t name a form element "submit"', 'Form elements with a name or id attribute with value "submit" can interfere with the form\'s submit event.');
        }
    });
})(jQuery);
