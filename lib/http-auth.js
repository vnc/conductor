var sys = require('sys'),
	util = require('util');

exports.authenticate = function(request, config, failureCallback, successCallback) {
	if (config) var username = config.username, password = config.password;
	
	var requestUsername = "";
	var requestPassword = "";
	if (!request.headers['authorization']) {
		failureCallback();
		sys.log('Authentication failure from ' + request.connection.remoteAddress);
	} else {
		var auth = _decodeBase64(request.headers['authorization']);
		if (auth) {
			if ((auth.username).toLowerCase() == (username).toLowerCase() && auth.password == password) {
				sys.log('Successful authentication by ' + auth.username + ' from ' + request.connection.remoteAddress);
				successCallback(username);
			} else {
				failureCallback();
				sys.log('Incorrect username and/or password from ' + request.connection.remoteAddress);
			}
		} else {
			failureCallback();
			sys.log('Unable to base 64 decode authorization header');
		}
	}
};

var _decodeBase64 = function(headerValue) {
	var value;
	if (value = headerValue.match("^Basic\\s([A-Za-z0-9+/=]+)$")) {
		var auth = (new Buffer(value[1] || "", "base64")).toString("ascii");
		return {
			username: auth.slice(0, auth.indexOf(':')),
			password: auth.slice(auth.indexOf(':')+1, auth.length)
		};
	} else {
		return null;
	}
};