/**
 * @fileoverview Prevent variables used in JSX to be marked as unused
 * @author Yannick Croissant
 */

'use strict';

const docsUrl = require('../util/docsUrl');
const { markVariableAsUsed } = require('../util/eslint');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const isTagNameRe = /^[a-z]/;
/** @type {(name: unknown) => boolean} */
function isTagName(name) { return isTagNameRe.test(name); }

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  // eslint-disable-next-line eslint-plugin/prefer-message-ids -- https://github.com/not-an-aardvark/eslint-plugin-eslint-plugin/issues/292
  meta: {
    docs: {
      description: 'Disallow variables used in JSX to be incorrectly marked as unused',
      category: 'Best Practices',
      recommended: true,
      url: docsUrl('jsx-uses-vars'),
    },
    schema: [],
  },

  create(context) {
    return {
      /** @param {JSXOpeningElement} node */
      JSXOpeningElement(node) {
        /** @type {string} */
        let name;
        if ('namespace' in node.name && node.name.namespace) {
          // <Foo:Bar>
          return;
        }
        if ('name' in node.name && node.name.name) {
          // <Foo>
          name = node.name.name;
          // Exclude lowercase tag names like <div>
          if (isTagName(name)) {
            return;
          }
        } else if ('object' in node.name && node.name.object) {
          // <Foo...Bar>
          let parent = node.name.object;
          while ('object' in parent && parent.object) {
            parent = parent.object;
          }
          name = parent.name;
        } else {
          return;
        }

        markVariableAsUsed(name, node, context);
      },

    };
  },
};
