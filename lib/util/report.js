'use strict';

/** @type {(context: Context, message: string, messageId?: string, data?: object) => void} */
module.exports = function report(context, message, messageId, data) {
  context.report({
    ...messageId ? { messageId } : { message },
    ...data,
  });
};
