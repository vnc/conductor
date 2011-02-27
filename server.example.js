require.paths.unshift(__dirname + '/lib');
require.paths.unshift(__dirname + '/lib/xml2js/lib');

var sys = require('sys'),
	http = require('http'),
	fs = require('fs'),
	conductor = require('conductor'),
	aws = require('aws-lib'),
	simpledb = require('simpledb/lib/simpledb'),
	uuid = require('uuid'),
	dt = require('date-util');

//read config.json
try {
	var configJSON = fs.readFileSync(__dirname + "/config.json");
	var config = JSON.parse(configJSON.toString());
	conductor.config = config;
} catch(e) {
	sys.log("File config.json not found. Try: `cp config.json.sample config.json`");
	sys.log(e);
}

//setup default variables
var port = (process.env.PORT || config.port) // use env var, otherwise use value from config.json
	, simpledbKey = (process.env.AWS_SIMPLEDB_KEY || config.aws_simpledb_key)
	, simpledbSecretKey = (process.env.AWS_SIMPLEDB_SECRET || config.aws_simpledb_secret_key);

// uncomment this to enable https on port 443
//var https = require('https'), port = 443;

var sdb = new simpledb.SimpleDB({ keyid: simpledbKey, secret: simpledbSecretKey, secure: true });

var isOwner = function(instanceId, username, callback) {
	return sdb.getItem('VncAwsInstanceMetadata', instanceId, {}, function(err, result, meta) {
		if (err) sys.log("Exception in isOwner: " + JSON.stringify(err));
		callback( result.CreatedBy == username );
	});
};

// all before functions receive a single parameter
// 1) the query string as a generic object
conductor.beforeCreate = null;
conductor.beforeStart = function(q, callback) {
	isOwner(q.instanceId, 'AWS\\chris.castle', function(result) {
		if (!result) callback({ httpCode: 403, message: 'You cannot start instance ' + q.instanceId + ' because you do not own it.' });
		else callback({});
	});
};
// TODO: replace with username of currently authenticated user
conductor.beforeStop = function(q, callback) {
	isOwner(q.instanceId, 'AWS\\chris.castle', function(result) {
		if (!result) callback({ httpCode: 403, message: 'You cannot stop instance ' + q.instanceId + ' because you do not own it.' });
		else callback({});
	});
};
conductor.beforeTerminate = function(q, callback) {
	isOwner(q.instanceId, 'AWS\\chris.castle', function(result) {
		if (!result) callback({ httpCode: 403, message: 'You cannot terminate instance ' + q.instanceId + ' because you do not own it.' });
		else callback({});
	});
};

// all after functions receive three parameters
// 1) the query string as a generic object
// 2) the http return code as an int
// 3) the http return message as a string
conductor.afterCreate = function(q, httpCode, msg) {
	if (httpCode != 200 || msg.indexOf('running') >= 0) return; // don't log to simpledb on failure or if it's already running
	var msgObj = JSON.parse(msg); // make it an object so we can access properties instead of doing text parsing
	sdb.putItem('test_VncAwsOperationHistory', "" + uuid().toLowerCase(),
		{
			Message: 'The instance ' + q.instanceId + ' has been successfully created by ' + msgObj.data.user + '.',
			Date: (new Date()).format('isoDateTime')
		},
		function(err, result, meta) {
			if (err) sys.log(err);
		}
	);
};
conductor.afterStart = function(q, httpCode, msg) {
	if (httpCode != 200 || msg.indexOf('running') >= 0) return; // don't log to simpledb on failure or if it's already running
	var msgObj = JSON.parse(msg); // make it an object so we can access properties instead of doing text parsing
	sdb.putItem('test_VncAwsOperationHistory', "" + uuid().toLowerCase(),
		{
			Message: 'The instance ' + q.instanceId + ' has been successfully started by ' + msgObj.data.user + '.',
			Date: (new Date()).format('isoDateTime')
		},
		function(err, result, meta) {
			if (err) sys.log(err);
		}
	);
};
conductor.afterStop = function(q, httpCode, msg) {
	if (httpCode != 200 || msg.indexOf('stopped') >= 0) return; // don't log to simpledb on failure or if it's already stopped
	var msgObj = JSON.parse(msg); // make it an object so we can access properties instead of doing text parsing
	sdb.putItem('test_VncAwsOperationHistory', "" + uuid().toLowerCase(),
		{
			Message: 'The instance ' + q.instanceId + ' has been successfully stopped by ' + msgObj.data.user + '.',
			Date: (new Date()).format('isoDateTime')
		},
		function(err, result, meta) {
			if (err) sys.log(err);
		}
	);
};
conductor.afterTerminate = function(q, httpCode, msg) {
	if (httpCode != 200 || msg.indexOf('terminated') >= 0) return; // don't log to simpledb on failure or if it's already terminated
	var msgObj = JSON.parse(msg); // make it an object so we can access properties instead of doing text parsing
	sdb.putItem('test_VncAwsOperationHistory', "" + uuid().toLowerCase(),
		{
			Message: 'The instance ' + q.instanceId + ' has been successfully terminated by ' + msgObj.data.user + '.',
			Date: (new Date()).format('isoDateTime')
		},
		function(err, result, meta) {
			if (err) sys.log(err);
		}
	);
};

// uncomment this to enable https
// also comment out the http.createServer... line below
/*var sslOptions = {
	ca: fs.readFileSync('sub.class1.server.ca.pem'),
	key: fs.readFileSync('ssl.key'),
	cert: fs.readFileSync('ssl.crt')
};

https.createServer(sslOptions, conductor.router).listen(port); */
http.createServer(conductor.router).listen(port);
sys.log('Listening on http://0.0.0.0:' + port);
