/*
 * lexer-test.js: More complex tests for the Kyuri lexer.
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENSE
 *
 */

require.paths.unshift(require('path').join(__dirname, '..', 'lib'));

var kyuri = require('kyuri'),
    fs = require('fs'),
    path = require('path'),
    vows = require('vows'),
    assert = require('assert'),
    inspect = require('eyes').inspector({
      styles: {
        all:     'cyan',      // Overall style applied to everything
        label:   'underline', // Inspection labels, like 'array' in `array: [1, 2, 3]`
        other:   'inverted',  // Objects which don't have a literal representation, such as functions
        key:     'bold',      // The keys in object literals, like 'a' in `{a: 1}`

        special: 'grey',      // null, undefined...
        string:  'green',
        number:  'magenta',
        bool:    'blue',      // true false
        regexp:  'green',     // /\d+/
      },
      maxLength: 4096
    });
    
var readAllLines = function (filename) {
  return function () {
    fs.readFile(filename, encoding = 'ascii', this.callback);
  } 
};

vows.describe('kyuri/lexer').addBatch({
  "When using the Kyuri lexer,": {
    "lexing simple.feature": {
      topic: readAllLines(path.join(__dirname, '..', 'examples', 'simple.feature')),
      "should lex correctly": function (err, data) {
        assert.isNotNull(data.toString());
        eyes.inspect(kyuri.tokens(data.toString()));
      }
    },
    "lexing complex.feature": {
      topic: readAllLines(path.join(__dirname, '..', 'examples', 'complex.feature')),
      "should lex correctly": function (err, data) {
        assert.isNotNull(data.toString());
        inspect(kyuri.tokens(data.toString()));
      }
    }
  }
}).export(module);
