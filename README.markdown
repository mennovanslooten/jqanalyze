# jQuery Analyze Plugin

This plugin is intended to help out with jQuery development by providing
runtime feedback on how selectors, events and the DOM is utilized. In its
current state it's not so much of a help as it is a proof of concept. The code
to enable analysis and generate a report has been written but it is useless
without a set of sensible analyzers.

The plugin is equipped to give feedback on use of jQuery selectors, bound
events and DOM structure. Additionally it will measure the performance of
jQuery selectors and event handlers.

## How to use

To use the plugin in your jQuery project, simply add the plugin directory to
your root and add the following script tag to your HTML. For the best results,
add it right after the jQuery script tag.

    <script type="text/javascript"
    src="path/to/jqanalyze/jquery.analyze.js"></script>

If you then open the page in your browser you'll see a yellow and black striped
bar on the right. Hover over that bar to see the report for that page. The
report is updated in real time so if you continue to interact with the page
you'll get more (interesting) results. It doesn't matter if you close the
report or leave it open in the meantime.

## How not to use

Please don't take any of the current feedback very seriously. It is only
intended as a proof of concept.

## How to contribute

As mentioned, right now the most lacking part are the actual analyzers. There's
three different types of analyzers you can add or modify. The simplest is the
DOM analyzer.

### Adding a DOM analyzer

This creates a warning for having an H2 element but no H1
element:

    $.analyze.addDOMAnalyzer(function() {
        if ($('h2').length && !$('h1').length) {
            return 'h1 should be the top header';
        }
    });

### Adding a selector analyzer

There's two ways to add a selector analyzer. The simplest is
a regular-expression based check:

    $.analyze.addSelectorRegexp(
            /(:[\w]+)/,
            'jQuery pseudo classes like <code>$1</code> can be slow.');

The `addSelectorRegexp` takes two arguments:

 - The regular expression that should be matched.
 - The warning message displayed when it matches.
   
This one will check for pseudo classes like `:first` and `:input`. Note the `$1` in
the warning message. It will be replaced by the matching group in the regular
expression.

The other way to add a selector analyzer is more flexible.

    $.analyze.addSelectorAnalyzer(function(selector, result, duration) {
        /*
         - selector: The selector string used
         - result:   The jQuery object returned
         - duration: The time in ms it took to execute the selector query
        Do whatever you want here and return a string if a warning should be
        displayed.
        */
    });

### Adding an event binding analyzer

Adding an event binding analyzer is very similar to the second method of adding
a selector analyzer:

    $.analyze.addEventAnalyzer(function(type, result, duration) {
        /*
         - type:     The type of event (click, load, etc)
         - result:   The jQuery object returned
         - duration: The time in ms it took to execute the selector query
        Do whatever you want here and return a string if a warning should be
        displayed
        */
    });
