/*
 * parser.js: Custom state machine based Parser for Kyuri
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENSE
 *
 */

var sys = require('sys'),
    eyes = require('eyes');

var Generator = require('./generator').Generator;

//
// Helper method to get the last feature 
// (i.e. the current feature we are building the ast for)
//
var getLastFeature = function (ast) {
  var features = Object.keys(ast);
  return ast[features[features.length - 1]];
};

//
// Helper method to get the last scenario 
// (i.e. the current scenario we are building the ast for)
//
var getLastScenario = function (ast) {
  var feature = getLastFeature(ast); 
  return feature.scenarios[feature.scenarios.length - 1];
};

//
// Helper method to get the last step 
// (i.e. the current step we are building the ast for)
//
var getLastStep = function (ast) {
  var scenario = getLastScenario(ast); 
  return scenario.breakdown[scenario.breakdown.length - 1];
}

var _states = {
  start: {
    transitions: {
      'FEATURE': {
        value: 'FEATURE',
        next: 'feature'
      }
    }
  },

  finish: {
    transitions: { /* EMPTY */ }
  },

  feature: {
    transitions: {
      'SENTENCE': {
        value: '*',
        next: 'featureHeader',
        build: function (ast, token) {
          var id = Object.keys(ast).length + 1;
          ast[id.toString()] = { 
            name: token[1],
            description: '',
            scenarios: []
          };
        }
      }
    }
  },

  featureHeader: {
    transitions: {
      'TERMINATOR': {
        value: '*',
        next: 'featureHeader',
        last: ['TERMINATOR', 'SENTENCE']
      },
      'INDENT': {
        value: 1,
        next: 'featureDescription',
        last: 'TERMINATOR'
      }
    }
  },

  featureDescription: {
    transitions: {
      'TERMINATOR': {
        value: '*',
        next: 'featureDescription',
        last: ['SENTENCE', 'TERMINATOR']
      },
      'SENTENCE': {
        value: '*',
        next: 'featureDescription',
        last: ['TERMINATOR', 'INDENT'],
        build: function (ast, token) {
          var feature = getLastFeature(ast);
          feature.description += token[1] + '\n';
        }
      },
      'SCENARIO': {
        value: 'SCENARIO',
        next: 'scenario',
        last: ['TERMINATOR', 'OUTDENT'],
        build: function (ast, token) {
          var feature = getLastFeature(ast);
          feature.scenarios.push({
            outline: false,
            breakdown: [],
          });
        }
      },
      'SCENARIO_OUTLINE': {
        value: 'SCENARIO_OUTLINE',
        next: 'scenario',
        last: ['TERMINATOR', 'OUTDENT'],
        build: function (ast, token) {
          var feature = getLastFeature(ast);
          feature.scenarios.push({
            outline: true,
            breakdown: [],
            hasExamples: false,
            examples: {}
          });
        }
      }
    }
  },

  scenario: {
    transitions: {
      'SENTENCE': {
        value: '*',
        next: 'scenarioHeader',
        last: ['SCENARIO', 'SCENARIO_OUTLINE'],
        build: function (ast, token) {
          var scenario = getLastScenario(ast);
          scenario.name = token[1];
        }
      }
    }
  },

  scenarioHeader: {
    transitions: {
      'TERMINATOR': {
        value: '*',
        next: 'scenarioHeader',
        last: 'SENTENCE'
      },
      'INDENT': {
        value: '*',
        next: 'stepOperator',
        last: 'TERMINATOR'
      }
    }
  },

  stepOperator: {
    transitions: {
      'OPERATOR': {
        value: '*',
        next: 'stepBody',
        last: ['INDENT', 'TERMINATOR'],
        build: function (ast, token) {
          var scenario = getLastScenario(ast),
              id = scenario.breakdown.length + 1,
              step = {};

          step[id.toString()] = [token[1]];
          scenario.breakdown.push(step);
        }
      },
      'EXAMPLES': {
        value: 'EXAMPLES',
        next: 'examples',
        last: 'TERMINATOR'
        // Remark: Could in 'build' here to see outline === true and throw, good idea? 
      },
      'OUTDENT': {
        value: 1,
        next: 'featureDescription',
        last: 'TERMINATOR'
      },
      'EOF': {
        value: 'EOF',
        next: 'finish',
        last: 'TERMINATOR'
      }
    }
  },

  stepBody: {
    transitions: {
      'SENTENCE': {
        value: '*',
        next: 'stepBody',
        last: 'OPERATOR',
        build: function (ast, token) {
          var scenario = getLastScenario(ast),
              step = getLastStep(ast);
              
          step[scenario.breakdown.length].push(token[1]);
        }
      },
      'TERMINATOR': {
        value: '*',
        next: 'stepOperator',
        last: 'SENTENCE'
      },
      'EOF': {
        value: 'EOF',
        next: 'finish',
        last: 'SENTENCE'
      }
    }
  },

  examples: {
    transitions: {
      'TERMINATOR': {
        value: '*',
        next: 'examples',
        last: ['TERMINATOR', 'EXAMPLES']
      },
      'INDENT': {
        value: 1,
        next: 'exampleRows',
        last: 'TERMINATOR'
      }
    }
  },

  exampleRows: {
    transitions: {
      'EXAMPLE_ROW': {
        value: '*',
        next: 'exampleRows',
        last: ['INDENT', 'TERMINATOR'],
        build: function (ast, token) {
          var scenario = getLastScenario(ast);
          if(!scenario.hasExamples) {
            for (var i = 0; i < token[1].length; i++) {
              scenario.examples[token[1][i]] = [];
            }
            
            scenario.exampleVariables = token[1];
            scenario.hasExamples = true;
          }
          else {
            for (var i = 0; i < token[1].length; i++) {
              scenario.examples[scenario.exampleVariables[i]].push(token[1][i]);
            }
          }
        }
      },
      'TERMINATOR': {
        value: '*',
        next: 'exampleRows',
        last: 'EXAMPLE_ROW'
      },
      'OUTDENT': {
        value: 2,
        next: 'featureDescription',
        last: 'TERMINATOR'
      },
      'EOF': {
        value: 'EOF',
        next: 'finish',
        last: 'TERMINATOR'
      }
    }
  }
};

//
// Constructor for the Parser object.
// The 'generator' parameter is a function that 
// takes in the output from parse and produces
// a code generator
//
var Parser = function (generator) {
  this.generator = generator || function (ast) {
    return new (Generator)(ast)
  };
};

Parser.prototype = {
  parse: function (tokens) {
    this.tokens = tokens;
    this.ast = {};
    this.states = Object.create(_states);
    this.current = this.states['start'];
    this.last = null;

    while (this.tokens.length > 0) {
      var token = this.tokens.shift();
      //eyes.inspect(token);
      this.checkToken(token);
      this.last = token;
    }
    
    return this.generator(this.ast);
  },

  checkToken: function (token) {
    var next = Object.keys(this.current.transitions);
    if (next.indexOf(token[0]) !== -1) {
      this.checkTransition(token, this.current.transitions[token[0]]);
    }
    else {
      throw new Error('Unexpected token "' + token[0] + '" at line ' + token[2]);
    }
  },

  checkTransition: function (token, transition) {
    // If the transition value matches the current token and the last token
    // was expected in our state machine, enter that state. Otherwise
    // throw an error for an unexpected value.
    if ((transition.value === '*' || transition.value === token[1])
      && this.checkLast(transition)) {
      // If we need to modify the ast in some way for this 
      // transition, do so now. 
      if (typeof transition.build === 'function') {
        transition.build(this.ast, token);
      }
      
      this.current = this.states[transition.next];
    }
    else {
      throw new Error('Unexpected value "' + token[1] + '" for token "' + token[0] + '" at line ' + token[2]);
    }
  },

  checkLast: function (transition) {
    if (typeof transition.last === 'undefined'
      || (typeof transition.last === 'string' && transition.last === this.last[0])) {
      return true;
    }
    else if (transition.last instanceof Array
      && transition.last.indexOf(this.last[0]) !== -1) {
      return true;
    }

    throw new Error('Mismatched last token "' + this.last[0] + '" at line ' + this.last[2]);
  }
};

exports.Parser = Parser;
