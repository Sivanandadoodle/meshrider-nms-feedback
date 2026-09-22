// Where this page sends and reads feedback.
//
// Paste your Google Apps Script web app URL between the quotes - the same
// /exec address the product uses for FEEDBACK_WEBHOOK_URL - then save.
// The page starts working the moment this is set.
//
// Leave it blank and the page still reads fine; only the feedback part is off.
//
// NOTE: this file is public. Anyone who opens the page can read this address
// and post to your sheet directly. That is the trade for hosting on GitHub
// Pages, which can only serve files. If it ever attracts nuisance, deploy the
// Apps Script again to get a fresh address and change this line.

window.NMS_FEEDBACK_ENDPOINT = "https://script.google.com/macros/s/AKfycbz1_cvF5_7bvA0DAQYUCVlMw2atzSoOM9iD7FQuN1RtpE-ku33ocFc_V6xNpbKCV5h9/exec";
