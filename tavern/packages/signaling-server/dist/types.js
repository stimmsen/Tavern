// Type definitions and runtime guards for signaling protocol messages.
const isObject = (value) => {
    return typeof value === "object" && value !== null;
};
const hasNonEmptyString = (value) => {
    return typeof value === "string" && value.trim().length > 0;
};
export const isJoinMessage = (value) => {
    if (!isObject(value) || value.type !== "join") {
        return false;
    }
    return hasNonEmptyString(value.room);
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
    if (isAnswerMessage(parsed)) {
        return parsed;
    }
    if (isIceCandidateMessage(parsed)) {
        return parsed;
    }
    return null;
};
