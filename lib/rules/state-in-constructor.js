/**
 * @fileoverview Enforce the state initialization style to be either in a constructor or with a class property
 * @author Kanitkorn Sujautra
 */

'use strict';

const { inConstructor } = require('../util/ast');
const {
  getParentES6Component,
  isStateMemberExpression,
} = require('../util/componentUtil');
const docsUrl = require('../util/docsUrl');
const report = require('../util/report');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  stateInitConstructor: 'State initialization should be in a constructor',
  stateInitClassProp: 'State initialization should be in a class property',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Enforce class component state initialization style',
      category: 'Stylistic Issues',
      recommended: false,
      url: docsUrl('state-in-constructor'),
    },

    messages,

    schema: [{
      enum: ['always', 'never'],
    }],
  },

  create(context) {
    const option = context.options[0] || 'always';
    return {
      'ClassProperty, PropertyDefinition'(node) {
        if (
          option === 'always'
          && !node.static
          && node.key.name === 'state'
          && getParentES6Component(context, node)
        ) {
          report(context, messages.stateInitConstructor, 'stateInitConstructor', {
            node,
          });
        }
      },
      AssignmentExpression(node) {
        if (
          option === 'never'
          && isStateMemberExpression(node.left)
          && inConstructor(context, node)
          && getParentES6Component(context, node)
        ) {
          report(context, messages.stateInitClassProp, 'stateInitClassProp', {
            node,
          });
        }
      },
    };
  },
};
