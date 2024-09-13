/**
 * @fileoverview Prevent React to be marked as unused
 * @author Glen Mailer
 */

'use strict';

const {
  getFragmentFromContext,
  getFromContext,
} = require('../util/pragma');
const docsUrl = require('../util/docsUrl');
const { markVariableAsUsed } = require('../util/eslint');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  // eslint-disable-next-line eslint-plugin/prefer-message-ids -- https://github.com/not-an-aardvark/eslint-plugin-eslint-plugin/issues/292
  meta: {
    docs: {
      description: 'Disallow React to be incorrectly marked as unused',
      category: 'Best Practices',
      recommended: true,
      url: docsUrl('jsx-uses-react'),
    },
    schema: [],
  },

  create(context) {
    const pragma = getFromContext(context);
    const fragment = getFragmentFromContext(context);

    /**
     * @param {JSXOpeningElement | JSXOpeningFragment} node
     * @returns {void}
     */
    function handleOpeningElement(node) {
      markVariableAsUsed(pragma, node, context);
    }
    // --------------------------------------------------------------------------
    // Public
    // --------------------------------------------------------------------------

    return {
      JSXOpeningElement: handleOpeningElement,
      JSXOpeningFragment: handleOpeningElement,
      /** @param {JSXFragment} node */
      JSXFragment(node) {
        markVariableAsUsed(fragment, node, context);
      },
    };
  },
};
