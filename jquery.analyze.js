(function( $ ) {
    var _report = $('<div id="jQA-Report"><div id="jQA-Report-Button"/><div id="jQA-Warnings"/><div id="jQA-Performance"/></div>');
    //var _report = $('#jQA-Report');
    var _orig_find = $.fn.find;
    var _orig_bind = $.fn.bind;
    var _orig_unbind = $.fn.unbind;
    var _selectors = [];
    var _selector_analyzers = [];
    var _event_analyzers = [];
    var _dom_analyzers = [];
    var _BASE_DIR;
    if (typeof console === 'undefined') {
        window.console = {
            log:function() {},
            dir:function() {},
            group:function() {},
            groupEnd:function() {},
            clear:function() {},
            table:function() {},
            warn:function() {}
        };
    }

    var _find_replacement = function(selector) {
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
    };


    var _handler_wrappers = [];
    function getHandlerWrapper(handler) {
        if (typeof handler === 'undefined') {
            return;
        }

        for (var i = 0; i < _handler_wrappers.length; i++) {
            var item = _handler_wrappers[i];
            if (item.orig === handler) {
                return item.wrapper;
            }
        }

        function wrapper(e) {
            var d1 = new Date().valueOf();
            var result = handler.apply(this, arguments);
            var d2 = new Date().valueOf();
            // TODO: Store timer data somewhere for another performance table
            if (d2 - d1 > 1) {
                console.log('executed event handler', e.type, 'in', (d2-d1), 'ms');
            }
            return result;
        }

        _handler_wrappers.push({
            orig:handler,
            wrapper:wrapper
        });

        return wrapper;
    }


    var _unbind_replacement = function(type, fn) {
        return _orig_unbind.call(this, type, getHandlerWrapper(fn));
    };


    var _bind_replacement = function(type, data, fn) {
        var d1 = new Date().valueOf();
        if ($.isFunction(data) || data === false) {
            fn = data;
            data = undefined;
        }

        var result = _orig_bind.call(this, type, data, getHandlerWrapper(fn));
        var d2 = new Date().valueOf();

        // Execute all event analyzers
        disable();
        for (var i = 0; i < _event_analyzers.length; i++) {
            _event_analyzers[i](type, result, d1, d2);
        }
        enable();

        return result;
    };


    function init() {
        $(document).ready(initDOMAnalysis);
        $(document).ready(initReport);

        $('script').each(function() {
            if (!this.src) {
                return true;
            }

            var index = this.src.indexOf('jquery.analyze.js');
            if (index > -1) {
                _BASE_DIR = this.src.substr(0, index);
            }
        });
        //var stylesheet = $('<link type="text/css" rel="stylesheet" href="' + _BASE_DIR + 'report.css"/>');
        //$("head").append(stylesheet);
        var stylesheet = document.createElement('link');
        stylesheet.setAttribute('type', 'text/css');
        stylesheet.setAttribute('rel', 'stylesheet');
        stylesheet.setAttribute('href', _BASE_DIR + 'report.css');
        document.getElementsByTagName('head')[0].appendChild(stylesheet);

        enable();
        setInterval(updatePerformanceReport, 2000);
    }


    function enable() {
        $.fn.unbind = _unbind_replacement;
        $.fn.bind = _bind_replacement;
        $.fn.find = _find_replacement;
    }


    function disable() {
        $.fn.unbind = _orig_unbind;
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


    function initReport() {
        $('body').append(_report);
        var button_container = $('');
        var button = button_container.find('button');
        button.toggle(
            function() {
                //_report.hide();
                _report.animate({right:'-470px'}, 'fast');
                $(this).text('Show report');
            },
            function() {
                //_report.show();
                _report.animate({right:'0'}, 'fast');
                $(this).text('Hide report');
            }
        );
        $('body').append(button_container);
        button.click();
    }


    function updatePerformanceReport() {
        disable();
        var rows = {};
        var sorted = [];
        for (var i = 0; i < _selectors.length; i++) {
            var item = _selectors[i];
            if (!rows[item.selector]) {
                var new_row = {
                    selector : item.selector,
                    calls : 0,
                    total : 0
                };
                sorted.push(new_row);
                rows[item.selector] = new_row;
            }

            var row = rows[item.selector];
            row.results = item.results;
            row.calls += 1;
            row.total += item.duration;
            row.average = Math.round(row.total / row.calls);
        }

        sorted.sort(function(a, b) {
            return a.total > b.total ? -1 : 1;

            return b['Total Duration'] > a['Total Duration'];
        });

        var html = '<table>';
        html += '<thead><tr><th>Selector</th><th>Calls</th><th>Total (ms)</th><th>Average (ms)</th></thead>';
        html += '<tbody>';
        var length = Math.min(10, sorted.length);
        for (var i = 0; i < length; i++) {
            var row = sorted[i];
            html += '<tr>';
            html += '<td><code>' + row.selector + '</code></td>';
            html += '<td>' + row.calls + '</td>';
            html += '<td>' + row.total + '</td>';
            html += '<td>' + row.average + '</td>';
            html += '</tr>';
        }
        _report.find('#jQA-Performance').html(html);
        enable();
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
            var html = '<div class="jQA-Item jQA-Warning">';
            html += '<h2>' + warning + '</h2>';
            //console.group(warning);
            //console.warn.call(console, warning);
            if (moreinfo) {
                //console.log(moreinfo);
                html += '<p>' + moreinfo + '</p>';
            }
            html += '</div>';
            //console.log(html)
            _report.find('#jQA-Warnings').append(html);
            //console.groupEnd();
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
                if (matches.length > 1) {
                    message = matches[0].replace(rx, message);
                }
                $.analyze.warn('Selector warning: <code>' + selector + '</code>', message);
            }
        }

        return $.analyze.addSelectorAnalyzer(analyzer);
    };

    $.analyze.addSelectorRegexp(/(:[\w]+)/, 'jQuery pseudo-selectors like <code>$1</code> are slow.');

    $.analyze.addSelectorRegexp(/^.+(#[\w]+)/, 'Don\'t nest ID selector in another selector. Use <code>$("$1")</code> instead.');

    $.analyze.addSelectorRegexp(/^(#[\w]+) ([^>].+)/, 'Don\'t follow ID selectors with other selectors. Use <code>$("$1").find("$2")</code> instead.');

    $.analyze.addSelectorRegexp(/^(#[\w]+) > (.+)/, 'Don\'t follow ID selectors with other selectors. Use <code>$("$1").children("$2")</code> instead.');


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
                $.analyze.warn('Selector warning: <code>' + selector + '</code> used multiple times in a row.', 'If you use a selector multiple times in a row, you might be better off storing it in a variable');
            }
        }
    });


    /*
     * This analyzer tests if an event is bound to multiple elements and if so,
     * suggest delegation.
     */
    $.analyze.addEventAnalyzer(function(type, result, d1, d2) {
        if (result.length > 2) {
            $.analyze.warn('Event warning: handler bound to ' + result.length + ' elements', 'A <code>' + type + '</code> handler was bound to <code>$("' + result.selector + '")</code> which returned ' + result.length + ' results. Handlers bound to multiple similar elements can sometimes be optimized with event delegation.');
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
