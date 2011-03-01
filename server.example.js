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
	process.exit(1);
}

//setup default variables
var port = (process.env.PORT || config.port) // use env var, otherwise use value from config.json
	, simpledbKey = (process.env.AWS_SIMPLEDB_KEY || config.aws_simpledb_key)
	, simpledbSecretKey = (process.env.AWS_SIMPLEDB_SECRET || config.aws_simpledb_secret_key);

// uncomment this to enable https on port 443
//var https = require('https'), port = 443;

var sdb = new simpledb.SimpleDB({ keyid: simpledbKey, secret: simpledbSecretKey, secure: true });

var isOwner = function(instanceId, username, callback) {
	/*return sdb.getItem('VncAwsInstanceMetadata', instanceId, {}, function(err, result, meta) {
		if (err) sys.log("Exception in isOwner: " + JSON.stringify(err));
		callback( result.CreatedBy == username );
	});*/
	callback(true);
};

// all before functions receive a single parameter
// 1) the query string as a generic object
conductor.beforeCreate = function(q, username, callback) {
	// check that user is authorized to start instance with requested configuration
		// if user is not a member of q.env AD group
		// callback({ httpCode: 403, message: 'You are not authorized to create an instance with that configuration.' });
		// else continue to next check

	// required: q.env, q.displayName (freakin' simpledb library bug won't let me use parens in simpledb query so can't use imageName)
	//if (!q.env || !q.imageName || !q.name || !q.description)
	//	callback({ httpCode: 400, message: 'env, imageName, name, and description are required' });
	// optional: q.az, q.instanceType, q.keyPair, q.userData, q.secGroups
	
	// check that requested configuration is allowed
	var selectStatement = 'select *' +
						 ' from VncAwsInstanceCreation' +
						 ' where Environment=\'' + q.env + '\'' +
						 ' and DisplayName=\'' + q.displayName + '\'' +
						 ((q.az) ? ' and AvailabilityZone=\'' + q.az + '\'': "") +
						 ((q.instanceType) ? ' and PreferredInstanceSize=\'' + q.instanceType + '\'': "") +
						 ((q.keyPair) ? ' and KeyPair=\'' + q.keyPair + '\'': "");
	sdb.select(selectStatement, {}, function(err, result, meta) {
		if(!err) {
			if(result.length && result.length > 1) { // if more than 1 row returned, fail with error
				callback({ httpCode: 400, message: 'Parameters provided identify more than one allowed instance configuration.' });
			} else if (result.length && result.length == 0) { // if no rows returned, fail with error
				callback({ httpCode: 400, message: 'Parameters provided do not identify any allowed instance configurations.' });
			} else if (result.length && result.length == 1) { // if 1 row returned, set attributes of q and continue
				// add a bunch of attributes to q so that they can be used to make the RunInstances EC2 api request
				q.imageName = result[0]['$ItemName'];
				q.imageId = result[0].AmiId;
				q.az = result[0].AvailabilityZone;
				q.instanceType = result[0].PreferredInstanceSize;
				q.keyPair = result[0].KeyPair;
				q.secGroups = result[0].SecurityGroups;
				callback({});
			} else {
				callback({ httpCode: 400, message: 'Error querying instance configurations.' });
			}
		} else {
			callback({ httpCode: 403, message: 'Error validating instance creation parameters.' });
			sys.log("Error reading instance config from SimpleDB:");
			console.log(err);
		}
	});
};
conductor.beforeStart = function(q, username, callback) {
	isOwner(q.instanceId, username, function(result) {
		if (!result) callback({ httpCode: 403, message: 'You cannot start instance ' + q.instanceId + ' because you do not own it.' });
		else callback({});
	});
};
// TODO: replace with username of currently authenticated user
conductor.beforeStop = function(q, username, callback) {
	isOwner(q.instanceId, username, function(result) {
		if (!result) callback({ httpCode: 403, message: 'You cannot stop instance ' + q.instanceId + ' because you do not own it.' });
		else callback({});
	});
};
conductor.beforeTerminate = function(q, username, callback) {
	isOwner(q.instanceId, username, function(result) {
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
	
	// add item to operation history simpledb domain
	sdb.putItem('VncAwsOperationHistory', "" + uuid().toLowerCase(),
		{
			Message: 'Instance(s): ' + q.instanceId + ' has been successfully created by ' + msgObj.data.user + ' via VNC API.',
			Date: (new Date()).format('isoDateTime'),
			Environment: q.env
		},
		function(err, result, meta) {
			if (err) {
				sys.log("Error writing to VncAwsOperationHistory");
				console.log(err);
			}
		}
	);
	
	// add item to meta data simpledb domain
	sdb.putItem('VncAwsInstanceMetadata', msgObj.data.instanceId,
		{
			Name: q.name,
			Description: q.description,
			CreatedBy: msgObj.data.user,
			InstanceConfiguration: q.imageName
		},
		function(err, result, meta) {
			if (err) {
				sys.log("Error writing to VncAwsInstanceMetadata:");
				console.log(err);
			}
		}
	);
};
conductor.afterStart = function(q, httpCode, msg) {
	if (httpCode != 200 || msg.indexOf('running') >= 0) return; // don't log to simpledb on failure or if it's already running
	var msgObj = JSON.parse(msg); // make it an object so we can access properties instead of doing text parsing
	sdb.putItem('test_VncAwsOperationHistory', "" + uuid().toLowerCase(),
		{
			Message: 'Instance: ' + q.instanceId + ' has been successfully started by ' + msgObj.data.user + ' via VNC API.',
			Date: (new Date()).format('isoDateTime'),
			Environment: q.env
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
			Message: 'Instance: ' + q.instanceId + ' has been successfully stopped by ' + msgObj.data.user + ' via VNC API.',
			Date: (new Date()).format('isoDateTime'),
			Environment: q.env
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
			Message: 'Instance: ' + q.instanceId + ' has been successfully terminated by ' + msgObj.data.user + ' via VNC API.',
			Date: (new Date()).format('isoDateTime'),
			Environment: q.env
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
