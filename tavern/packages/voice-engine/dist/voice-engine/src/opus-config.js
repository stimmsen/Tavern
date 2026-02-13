// Applies voice-optimized Opus codec settings by rewriting SDP fmtp parameters.
const OPUS_RTPMAP_PATTERN = /^a=rtpmap:(\d+)\s+opus\/48000\/2$/i;
const buildOpusFmtp = (payloadType) => {
    const params = [
        "minptime=10",
        "useinbandfec=1",
        "maxaveragebitrate=64000",
        "stereo=0",
        "sprop-stereo=0",
        "cbr=0",
        "usedtx=1",
        "ptime=20"
    ].join(";");
    return `a=fmtp:${payloadType} ${params}`;
};
export const applyOpusConfig = (sdp) => {
    const newline = sdp.includes("\r\n") ? "\r\n" : "\n";
    const lines = sdp.split(/\r?\n/);
    let payloadType = null;
    for (const line of lines) {
        const match = line.match(OPUS_RTPMAP_PATTERN);
        if (match?.[1]) {
            payloadType = match[1];
            break;
        }
    }
    if (!payloadType) {
        console.log("[opus] Opus payload type not found, leaving SDP unchanged");
        return sdp;
    }
    const fmtpPattern = new RegExp(`^a=fmtp:${payloadType}\\s+`, "i");
    const fmtpIndex = lines.findIndex((line) => fmtpPattern.test(line));
    if (fmtpIndex === -1) {
        console.log("[opus] Opus fmtp line not found, leaving SDP unchanged");
        return sdp;
    }
    lines[fmtpIndex] = buildOpusFmtp(payloadType);
    console.log("[opus] Applied Opus voice settings", { payloadType });
    return lines.join(newline);
};
