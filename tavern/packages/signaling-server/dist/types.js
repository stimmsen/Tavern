// Type definitions and runtime guards for signaling protocol messages.
const isObject = (value) => {
    return typeof value === "object" && value !== null;
};
const hasNonEmptyString = (value) => {
    return typeof value === "string" && value.trim().length > 0;
};
const isIdentity = (value) => {
    if (!isObject(value)) {
        return false;
    }
    return (hasNonEmptyString(value.publicKeyHex) &&
        hasNonEmptyString(value.tag) &&
        (typeof value.displayName === "string" || value.displayName === null));
};
export const isJoinMessage = (value) => {
    if (!isObject(value) || value.type !== "join") {
        return false;
    }
    if (!hasNonEmptyString(value.room)) {
        return false;
    }
    if (typeof value.identity === "undefined") {
        return true;
    }
    return isIdentity(value.identity);
};
export const isUpdateIdentityMessage = (value) => {
    if (!isObject(value) || value.type !== "update-identity") {
        return false;
    }
    return isIdentity(value.identity);
};
export const isOfferMessage = (value) => {
    if (!isObject(value) || value.type !== "offer") {
        return false;
    }
    if (!hasNonEmptyString(value.sdp)) {
        return false;
    }
    if (typeof value.target === "undefined") {
        return true;
    }
    return hasNonEmptyString(value.target);
};
export const isAnswerMessage = (value) => {
    if (!isObject(value) || value.type !== "answer") {
        return false;
    }
    return hasNonEmptyString(value.sdp) && hasNonEmptyString(value.target);
};
export const isIceCandidateMessage = (value) => {
    if (!isObject(value) || value.type !== "ice-candidate") {
        return false;
    }
    return hasNonEmptyString(value.candidate) && hasNonEmptyString(value.target);
};
export const parseClientMessage = (raw) => {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (isJoinMessage(parsed)) {
        return parsed;
    }
    if (isOfferMessage(parsed)) {
        return parsed;
    }
    if (isUpdateIdentityMessage(parsed)) {
        return parsed;
    }
    if (isAnswerMessage(parsed)) {
        return parsed;
    }
    if (isIceCandidateMessage(parsed)) {
        return parsed;
    }
    return null;
};
