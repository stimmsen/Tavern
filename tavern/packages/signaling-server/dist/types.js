const isObject = (value) => {
    return typeof value === "object" && value !== null;
};
const hasNonEmptyString = (value) => {
    return typeof value === "string" && value.trim().length > 0;
};
const isOptionalString = (value) => {
    return typeof value === "undefined" || typeof value === "string";
};
const isIdentity = (value) => {
    if (!isObject(value)) {
        return false;
    }
    return (hasNonEmptyString(value.publicKeyHex) &&
        hasNonEmptyString(value.tag) &&
        (typeof value.displayName === "string" || value.displayName === null));
};
const isJoinChannelIdentity = (value) => {
    return isIdentity(value);
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
export const isCreateTavernMessage = (value) => {
    if (!isObject(value) || value.type !== "create-tavern") {
        return false;
    }
    return hasNonEmptyString(value.name) && isOptionalString(value.icon);
};
export const isJoinChannelMessage = (value) => {
    if (!isObject(value) || value.type !== "join-channel") {
        return false;
    }
    return (hasNonEmptyString(value.tavernId) &&
        hasNonEmptyString(value.channelId) &&
        isJoinChannelIdentity(value.identity));
};
export const isLeaveChannelMessage = (value) => {
    if (!isObject(value) || value.type !== "leave-channel") {
        return false;
    }
    return hasNonEmptyString(value.tavernId) && hasNonEmptyString(value.channelId);
};
export const isGetTavernInfoMessage = (value) => {
    if (!isObject(value) || value.type !== "get-tavern-info") {
        return false;
    }
    return hasNonEmptyString(value.tavernId);
};
export const isCreateChannelMessage = (value) => {
    if (!isObject(value) || value.type !== "create-channel") {
        return false;
    }
    return hasNonEmptyString(value.tavernId) && hasNonEmptyString(value.name);
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
    if (typeof value.target !== "undefined" && !hasNonEmptyString(value.target)) {
        return false;
    }
    if (typeof value.tavernId !== "undefined" && !hasNonEmptyString(value.tavernId)) {
        return false;
    }
    if (typeof value.channelId !== "undefined" && !hasNonEmptyString(value.channelId)) {
        return false;
    }
    return true;
};
export const isAnswerMessage = (value) => {
    if (!isObject(value) || value.type !== "answer") {
        return false;
    }
    if (!hasNonEmptyString(value.sdp) || !hasNonEmptyString(value.target)) {
        return false;
    }
    if (typeof value.tavernId !== "undefined" && !hasNonEmptyString(value.tavernId)) {
        return false;
    }
    if (typeof value.channelId !== "undefined" && !hasNonEmptyString(value.channelId)) {
        return false;
    }
    return true;
};
export const isIceCandidateMessage = (value) => {
    if (!isObject(value) || value.type !== "ice-candidate") {
        return false;
    }
    if (!hasNonEmptyString(value.candidate) || !hasNonEmptyString(value.target)) {
        return false;
    }
    if (typeof value.tavernId !== "undefined" && !hasNonEmptyString(value.tavernId)) {
        return false;
    }
    if (typeof value.channelId !== "undefined" && !hasNonEmptyString(value.channelId)) {
        return false;
    }
    return true;
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
    if (isCreateTavernMessage(parsed)) {
        return parsed;
    }
    if (isJoinChannelMessage(parsed)) {
        return parsed;
    }
    if (isLeaveChannelMessage(parsed)) {
        return parsed;
    }
    if (isGetTavernInfoMessage(parsed)) {
        return parsed;
    }
    if (isCreateChannelMessage(parsed)) {
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
