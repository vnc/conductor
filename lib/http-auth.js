var sys = require('sys'),
	util = require('util');

exports.authenticate = function(request, config, failureCallback, successCallback) {
	if (config && config.usrename) var username = config.username, password = config.password;
	
	if (!request.headers['authorization']) {
		failureCallback();
		sys.log('Authentication failure from ' + request.connection.remoteAddress);
	} else {
		var auth = _decodeBase64(request.headers['authorization']);
		if (auth) {
			exports.authenticationScheme(auth.username, auth.password, function(err, result) {
				if (err) {
					sys.log('Authentication error: ');
					console.log(err);
				} else {
					if (result == true) {
						sys.log('Successful authentication by ' + auth.username + ' from ' + request.connection.remoteAddress);
						successCallback(auth.username);
					} else if (result == false) {
						sys.log('Incorrect username and/or password from ' + request.connection.remoteAddress);
						failureCallback();
					} else {
						sys.log('Authentication module error: result is neither true nor false');
					}
				}
			});
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

// this can be overriden as needed
// by default it looks for a username and password in config.json
exports.authenticationScheme = _authenticator = function(username, password, callback) {
        console.log("WARNING: using default auth scheme");
        callback(null, true);
};

