var mongoose = require('mongoose');

var SecretSchema = mongoose.Schema({
  roomId: String,
	type: String,
	label: String,
	serviceProvider: String,
	identity: String,
	secret: String,
	issuer: String
});

var Secret = mongoose.model('Secret', SecretSchema);
Secret.uriPattern = /^otpauth:\/\/(\w+)\/([\w:-_\.]+)\?(.+)$/;

module.exports = Secret;
