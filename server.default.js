require.paths.unshift(__dirname + '/lib');

var sys = require('sys'),
	http = require('http'),
	fs = require('fs'),
	conductor = require('conductor');

//read config.json
try {
	var configJSON = fs.readFileSync(__dirname + "/config.json");
	var config = JSON.parse(configJSON.toString());
	conductor.config = config;
} catch(e) {
	console.log("File config.json not found. Try: `cp config.json.sample config.json`");
	console.error(e);
}

//setup default variables
var port = (process.env.PORT || config.port); // use env var, otherwise use value from config.json

// all before functions receive a single parameter
// 1) the query string as a generic object
// return true to cancel the action
conductor.beforeCreate = null;
conductor.beforeStart = null;
conductor.beforeStop = null;
conductor.beforeTerminate = null;
conductor.beforeAssociateAddress = null;

// all after function receive three parameters
// 1) the query string as a generic object
// 2) the http return code as an int
// 3) the http return message as a string
conductor.afterCreate = null;
conductor.afterStart = null;
conductor.afterStop = null;
conductor.afterTerminate = null;
conductor.afterAssociateAddress = null;

http.createServer(conductor.router).listen(port);
console.log('Listening on http://0.0.0.0:' + port);
