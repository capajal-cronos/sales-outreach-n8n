// Simple pass-through code node
// This gets the original email data from "Structure output" and passes it to the next node
// Place this AFTER the HTTP Request node
// The HTTP Request node already sent the data to the backend, this just passes the email data forward

// Get the original email data from the "Structure output" node
const email = $('Structure output').item.json;

// Pass it through for the next node (Send emails)
return { json: email };