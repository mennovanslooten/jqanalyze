/*
 * jQuery Analysis Plugin
 * Copyright 2011, Menno van Slooten
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * This plugin is set up in 4 parts:
 *  - Interceptors: this sets up a small pub/sub hub and starts intercepting
 *    find, bind and unbind.
 *  - Analysis: this inits all the actual analysis and triggers the warnings
 *  - Report: this generates a report from the warnings and does performance
 *    measurements on executed queries and event handlers. The report is added
 *    to the page as an overlay on the right.
 *  - Default analyzers: this sets up a couple of default selector, event and
 *    DOM analyzers.
 *  
 */


/* ################################################################
 * INTERCEPTORS
 * ################################################################ */
(function( $ ) {

    var _orig_find = $.fn.find;
    var _orig_bind = $.fn.bind;
    var _orig_unbind = $.fn.unbind;
    var _handler_wrappers = [];

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

    function getEventHandlerWrapper(handler, selector) {
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
            if (!selector && this.id) {
                selector = '#' + this.id;
            } else if (!selector) {
                selector = '(unknown)';
            }

            if (!selector || selector.indexOf('#jQA-') === -1) {
                $.analyze.publish('jqanalyze.trigger', {
                    type : e.type,
                    selector : selector,
                    duration : (d2 - d1)
                });
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
        return _orig_unbind.call(this, type, getEventHandlerWrapper(fn));
    };


    var _bind_replacement = function(type, data, fn) {
        var d1 = new Date().valueOf();
        if ($.isFunction(data) || data === false) {
            fn = data;
            data = undefined;
        }

        var result = _orig_bind.call(this, type, data, getEventHandlerWrapper(fn, this.selector));
        var d2 = new Date().valueOf();

        if (!this.selector || this.selector.indexOf('#jQA-') === -1) {
            $.analyze.publish('jqanalyze.bind', {
                type:type,
                result:result,
                duration:(d2 - d1)
            });
        }

        return result;
    };


    var _find_replacement = function(selector, context) {
        var d1 = new Date().valueOf();
        var result = _orig_find.apply(this, arguments);
        var d2 = new Date().valueOf();

        if (typeof context !== 'undefined') {
            // Skip selectors with context for now
            console.log('jQA selector skipped:', selector, 'with context', context);
            return result;
        }

        if (!selector || selector.indexOf('#jQA-') === -1) {
            $.analyze.publish('jqanalyze.find', {
                selector : selector,
                result   : result,
                duration : (d2 - d1)
            });
        }

        return result;
    };


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


    $.extend($, {
        analyze : {
            enable: enable,
            disable: disable,
            // Pubsub FTW
            publish: function(event, subject) {
                disable();
                $(document).trigger(event, subject);
                enable();
            }, 
            subscribe: function(event, handler) {
                disable();
                $(document).bind(event, handler);
                enable();
            }
        }
    });
    

    enable();
})(jQuery);


/* ################################################################
 * ANALYSIS
 * ################################################################ */
(function($) {
    var _selector_analyzers = [];
    var _event_analyzers = [];
    var _dom_analyzers = [];


    function addDOMAnalyzer(analyzer) {
        _dom_analyzers.push(analyzer);
    }


    function addSelectorAnalyzer(analyzer) {
        _selector_analyzers.push(analyzer);
    }


    function addEventAnalyzer(analyzer) {
        _event_analyzers.push(analyzer);
    }


    /*
     * This method is used for some generic, regular-expression based selector
     * testing.
     */
    function addSelectorRegexp(rx, message) {
        function analyzer(selector) {
            var warning = message;
            var matches = selector.match(rx);
            if (matches) {
                if (matches.length > 1) {
                    warning = matches[0].replace(rx, message);
                }
                return warning;
            }
        }

        addSelectorAnalyzer(analyzer);
    }


    $.analyze.subscribe('jqanalyze.bind', function(e, subject) {
        $.analyze.disable();
        for (var i = 0; i < _event_analyzers.length; i++) {
            var warning = _event_analyzers[i](subject.type, subject.result, subject.duration);
            if (warning) {
                $.analyze.publish('jqanalyze.warn', {
                    type:'Event',
                    subject:subject.type,
                    warning:warning
                });
            }
        }
        $.analyze.enable();
    });


    $.analyze.subscribe('jqanalyze.find', function(e, subject) {
        $.analyze.disable();
        for (var i = 0; i < _selector_analyzers.length; i++) {
            var warning = _selector_analyzers[i](subject.selector, subject.result, subject.duration);
            if (warning) {
                $.analyze.publish('jqanalyze.warn', {
                    type:'Selector',
                    subject:subject.selector,
                    warning:warning
                });
            }
        }
        $.analyze.enable();
    });


    $(document).ready(function() {
        $.analyze.disable();
        for (var i = 0; i < _dom_analyzers.length; i++) {
            var warning = _dom_analyzers[i]();
            if (warning) {
                $.analyze.publish('jqanalyze.warn', {
                    type:'DOM',
                    subject:'',
                    warning:warning
                });
            }
        }
        $.analyze.enable();
    });


    $.extend($.analyze, {
        addDOMAnalyzer : addDOMAnalyzer, 
        addSelectorAnalyzer : addSelectorAnalyzer,
        addSelectorRegexp : addSelectorRegexp,
        addEventAnalyzer : addEventAnalyzer 
    });

})(jQuery);


/* ################################################################
 * REPORT
 * ################################################################ */
(function( $ ) {

    var _report = $(
        '<div id="jQA-Report">'
            + '<h1>jQuery Analysis Tool</h1>'
            + '<div title="Close" id="jQA-CloseButton">close</div>'
            + '<a href="https://github.com/mennovanslooten/jqanalyze" title="Info" id="jQA-InfoButton">info</a>'
            + '<div id="jQA-Warnings" title="Warnings"/>'
            + '<div id="jQA-SelectorPerformance" title="Selector performance"/>'
            + '<div id="jQA-EventPerformance" title="Event handler performance"/>'
        + '</div>');
    var _ds = {
        selectors: {
            ary: [],
            attr: 'total',
            dir: -1
        },
        events: {
            ary: [],
            attr: 'total',
            dir: -1
        }
    }


    function loadReportCSS() {
        var filename = 'jquery.analyze.js';
        var oldsrc = $('script[src$="' + filename + '"]').attr('src');
        var newsrc = oldsrc.replace(filename, 'report.css');
        var stylesheet = document.createElement('link');
        stylesheet.setAttribute('type', 'text/css');
        stylesheet.setAttribute('rel', 'stylesheet');
        stylesheet.setAttribute('href', newsrc);
        document.getElementsByTagName('head')[0].appendChild(stylesheet);
    }


    var _selectorPerfContainer = _report.find('#jQA-SelectorPerformance');
    var _handlerPerfContainer = _report.find('#jQA-EventPerformance');
    var _warningContainer = _report.find('#jQA-Warnings');
    function init() {
        loadReportCSS();
        $('body').append(_report);
        _report.bind('click', reportClick); // Delegate
        _report
            .find('#jQA-CloseButton')
            .bind('click', closeReport);
        setTimeout(closeReport, 1000);

        _report.bind('mouseenter', openReport);
        //setInterval(updatePerformanceReport, 2000);
    }


    function updatePerformanceReport() {
        updateSelectorPerformanceTable();
        updateHandlerPerformanceTable();
    }
    $.analyze.subscribe('jqanalyze.trigger', updatePerformanceReport);
    $.analyze.subscribe('jqanalyze.find', updatePerformanceReport);


    function updateSelectorPerformanceTable() {
        var html = '<table>';
        html += '<thead><tr><th sortattr="selector">Selector</th><th sortattr="calls">Calls</th>' +
                '<th sortattr="total">Total (ms)</th><th sortattr="average">Average (ms)</th></thead>';
        html += '<tbody>';
        var ary = _ds.selectors.ary;
        var length = Math.min(10, ary.length);
        for (var i = 0; i < length; i++) {
            var row = ary[i];
            html += '<tr>';
            html += '<td><code>' + row.selector + '</code></td>';
            html += '<td>' + row.calls + '</td>';
            html += '<td>' + row.total + '</td>';
            html += '<td>' + row.average + '</td>';
            html += '</tr>';
        }
        _selectorPerfContainer.html(html);
        updateSortingHeader(_selectorPerfContainer, _ds.selectors.attr, _ds.selectors.dir);
        //_report.find('#jQA-SelectorPerformance th[sortattr=' + _ds.selectors.attr + ']').addClass('sortingth');
    }


    function updateHandlerPerformanceTable() {
        var html = '<table>';
        html += '<thead><tr><th sortattr="selector">Selector</th><th sortattr="type">Event</th>' +
                '<th sortattr="calls">Calls</th><th sortattr="total">Total (ms)</th><th sortattr="average">Average (ms)</th></thead>';
        html += '<tbody>';
        var ary = _ds.events.ary;
        var length = Math.min(10, ary.length);
        for (var i = 0; i < length; i++) {
            var row = ary[i];
            html += '<tr>';
            html += '<td><code>' + row.selector + '</code></td>';
            html += '<td><code>' + row.type + '</code></td>';
            html += '<td>' + row.calls + '</td>';
            html += '<td>' + row.total + '</td>';
            html += '<td>' + row.average + '</td>';
            html += '</tr>';
        }
        _handlerPerfContainer.html(html);
        updateSortingHeader(_handlerPerfContainer, _ds.events.attr, _ds.events.dir);
        //_report.find('#jQA-EventPerformance th[sortattr=' + _ds.events.attr + ']').addClass('sortingth');
    }


    function closeReport() {
        _report.animate({right:'-470px'}, 'fast');
    }


    function openReport() {
        _report.animate({right:'0'}, 'fast');
    }


    function reportClick(e) {
        var th = $(e.target).closest('th');
        if (!th || !th.length) {
            return;
        }
        var attr = th.attr('sortattr');
        if (attr) {
            var type = th.closest('div')[0].id.indexOf("Event") > -1 ? 'events' : 'selectors';
            updateSorting(attr, type);
            updatePerformanceReport();
        }
    }

    function sortedInsert(item, obj) {
        var ary = obj.ary, attr = obj.attr, dir = obj.dir;
        for (var i = 0; i < ary.length; i++) {
            if ((dir === 1 && item[attr] <= ary[i][attr]) ||
                (dir === -1 && item[attr] > ary[i][attr])) {
                ary.splice(i, 0, item);
                return;
            }
        }
        // If we get here, item should be at the end of the array:
        ary.push(item);
    }


    function updateSorting(newAttr, type) {
        var ary = _ds[type].ary;
        
        if (newAttr === _ds[type].attr) {
            _ds[type].dir *= -1;
            ary.reverse();
        } else {
            var attr = _ds[type].attr = newAttr;
            var dir = _ds[type].dir = (attr !== 'selector' && attr !== 'type') ? -1 : 1;
            ary.sort(function(a, b) {
                return (a[attr] < b[attr] ? -dir : dir);
            });
        }
    }


    function updateSortingHeader(container, attr, dir) {
        $.analyze.disable();
        var th = container.find('th[sortattr=' + attr + ']');
        th.addClass('sortingth').siblings().removeClass('sortingth');
        var ths = $(th).add(th.siblings());
        ths.each(function() {
            var currentTxt = $(this).text();
            currentTxt = currentTxt.replace(/\s*[\u25BC\u25B2]\s+$/gi, '').replace(/\s+$/gi, '');
            if ($(this).hasClass('sortingth')) {
                currentTxt += '   ' + (dir === -1 ? '\u25BC' : '\u25B2');
            }
            $(this).text(currentTxt);
        });
        $.analyze.enable();
    }

    $.analyze.subscribe('jqanalyze.trigger', function(e, subject) {
        // Store the intercepted handlers and sort by total time spent
        // executing
        var itemIndex = -1;
        var item = $.grep(_ds.events.ary, function(n, i) {
            if (n.selector === subject.selector && n.type === subject.type) {
                itemIndex = i;
                return true;
            }
            return false;
        })[0];

        if (!item) {
            item = {
                selector : subject.selector,
                type : subject.type,
                calls : 0,
                total : 0
            };
        } else {
            _ds.events.ary.splice(itemIndex, 1);
        }
        
        item.calls += 1;
        item.total += subject.duration;
        item.average = Math.round(item.total / item.calls);
        sortedInsert(item, _ds.events);
    });


    $.analyze.subscribe('jqanalyze.find', function(e, subject) {
        // Store the intercepted selectors and sort by total time spent finding
        // the elements.
        var itemIndex = -1;
        var item = $.grep(_ds.selectors.ary, function(n, i) {
            if (n.selector === subject.selector) {
                itemIndex = i;
                return true;
            }
            return false;
        })[0];

        if (!item) {
            item = {
                selector : subject.selector,
                calls : 0,
                total : 0
            };
        } else {
            _ds.selectors.ary.splice(itemIndex, 1);
        }
        
        item.calls += 1;
        item.total += subject.duration;
        item.average = Math.round(item.total / item.calls);
        sortedInsert(item, _ds.selectors);
    });


    $.analyze.subscribe('jqanalyze.warn', function(e, warning) {
        var html = '<div class="jQA-Item jQA-Warning">';
        var title = warning.type + ' warning: <code>' + warning.subject + '</code>';
        html += '<h2>' + title + '</h2>';
        if (warning.warning) {
            html += '<p>' + warning.warning + '</p>';
        }
        html += '</div>';
        var item = $(html);
        var p = item.find('p');
        item.toggle(
            function() { p.hide(); },
            function() { p.show(); }
        );
        _warningContainer.append(item);
    });


    $(document).ready(init);
})(jQuery);



/* ################################################################
 * DEFAULT ANALYZERS
 * ################################################################ */
(function( $ ) {

    $.analyze.addSelectorRegexp(/(:[\w]+)/, 'jQuery pseudo-selectors like <code>$1</code> can be slow.');

    $.analyze.addSelectorRegexp(/^.+(#[\w]+)/, 'There should be no need to prepend an ID selector with another selector. Use <code>$("$1")</code> instead.');

    $.analyze.addSelectorRegexp(/^(#[\w]+) ([^>].+)/, 'Don\'t follow ID selectors with other selectors. Use <code>$("$1").find("$2")</code> instead.');

    $.analyze.addSelectorRegexp(/^(#[\w]+) > (.+)/, 'Don\'t follow ID selectors with other selectors. Use <code>$("$1").children("$2")</code> instead.');


    /*
     * This analyzer tests if a selector is used multiple times in a row and
     * yields similar results. If so, suggest storing the result in a variable.
     */
    var _used_selectors = [];
    $.analyze.addSelectorAnalyzer(function(selector, result, duration) {
        _used_selectors.push({
            selector:selector,
            results:result.length
        });
        var length = _used_selectors.length;
        if (length > 1) {
            var prev = _used_selectors[length - 2];
            if (prev.selector ===  selector && prev.results === result.length) {
                return '<code>' + selector + '</code> used multiple times in a row. If you use a selector multiple times in a row, you might be better off storing it in a variable';
            }
        }
    });


    /*
     * This analyzer tests if an event is bound to multiple elements and if so,
     * suggest delegation.
     */
    $.analyze.addEventAnalyzer(function(type, result, duration) {
        if (result.length > 2) {
            return 'A <code>' + type + '</code> handler was bound to <code>$("' + result.selector + '")</code> which returned ' + result.length + ' results. Handlers bound to multiple similar elements can sometimes be optimized with event delegation.';
        }
    });


    /*
     * This analyzer tests is a form element exists with the name or id
     * "submit".
     */
    $.analyze.addDOMAnalyzer(function() {
        var baaaaad = $('form :input[name=submit], form :input[id=submit]');
        if (baaaaad.length) {
            return 'Form elements with a name or id attribute with value "submit" can interfere with the form\'s submit event.';
        }
    });
})(jQuery);    
