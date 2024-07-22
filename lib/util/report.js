'use strict';

module.exports = function report(context, message, messageId, data) {
  context.report({
    ...messageId ? { messageId } : { message },
    ...data,
  });
};
