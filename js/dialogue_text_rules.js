/**
 * dialogue_text_rules.js
 * 会話文の表示上の組版規則を一元管理する。
 * 元データは変更せず、鉤括弧で閉じる会話だけ終端句点を省く。
 */
window.DialogueTextRules = Object.freeze({
    normalizeConversationText(text) {
        return String(text ?? '').replace(/。+(?=」)/g, '');
    }
});
