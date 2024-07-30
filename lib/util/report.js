'use strict';

/** @type {(context: Context, message: string, messageId?: string, data?: Omit<import('eslint').Rule.ReportDescriptor, 'messageId' | 'message'>) => void} */
module.exports = function report(context, message, messageId, data) {
  context.report({
    ...messageId ? { messageId } : { message },
    // @ts-expect-error see https://github.com/microsoft/TypeScript/issues/55083
    ...data,
  });
};
