/**
 * @fileoverview Prevent usage of setState
 * @author Mark Dalgleish
 */

'use strict';

const Components = require('../util/Components');
const docsUrl = require('../util/docsUrl');
const report = require('../util/report');
const {
  isMemberExpression,
  isThisExpression,
} = require('../util/ast');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  noSetState: 'Do not use setState',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow usage of setState',
      category: 'Stylistic Issues',
      recommended: false,
      url: docsUrl('no-set-state'),
    },

    messages,

    schema: [],
  },

  create: Components.detect((context, components, utils) => {
    /**
     * Checks if the component is valid
     * @param {Components.Component} component The component to process
     * @returns {boolean} True if the component is valid, false if not.
     */
    function isValid(component) {
      return !!component && !component.useSetState;
    }

    /**
     * Reports usages of setState for a given component
     * @param {Components.Component} component The component to process
     */
    function reportSetStateUsages(component) {
      for (let i = 0, j = component.setStateUsages.length; i < j; i++) {
        const setStateUsage = component.setStateUsages[i];
        report(context, messages.noSetState, 'noSetState', {
          node: setStateUsage,
        });
      }
    }

    return {
      /** @type {(node: CallExpression) => void} */
      CallExpression(node) {
        const { callee } = node;
        if (
          !isMemberExpression(callee)
          || !isThisExpression(callee.object)
          || (!('name' in callee.property) || callee.property.name !== 'setState')
        ) {
          return;
        }
        const component = components.get(utils.getParentComponent(node));
        const setStateUsages = (component && component.setStateUsages) || [];
        setStateUsages.push(callee);
        components.set(node, {
          useSetState: true,
          setStateUsages,
        });
      },

      'Program:exit'() {
        Object.values(components.list())
          .filter((component) => !isValid(component))
          .forEach((component) => {
            reportSetStateUsages(component);
          });
      },
    };
  }),
};
