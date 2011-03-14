require.paths.unshift(__dirname + '/lib');
require.paths.unshift(__dirname + '/lib/xml2js/lib');
require.paths.unshift(__dirname + '/lib/simpledb/lib');

var sys = require('sys'),
	http = require('http'),
	fs = require('fs'),
	conductor = require('conductor'),
	aws = require('aws-lib'),
	simpledb = require('simpledb/lib/simpledb'),
	uuid = require('uuid'),
	dt = require('date-util'),
	exec = require('child_process').exec;

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

// execute callback(true) if username is admin or instance was created by username
var isAllowed = function(instanceId, username, env, callback) {
	isEnvAdmin(username, env, function(result) {
		if (result == true) { callback( true ); }
		else {
			sdb.getItem('VncAwsInstanceMetadata', instanceId, {}, function(err, result, meta) {
				if (err) sys.log("Exception in isAllowed: " + JSON.stringify(err));
				callback( (result.CreatedBy).toLowerCase() == (username).toLowerCase() );
			});
		}
	});
};

// return true if user is admin within env account
var isEnvAdmin = function(username, env, callback) {
	var user = username.split('\\')[1]; // remove 'aws\' domain prefix from username
	var command = "/home/ec2-user/Projects/conductor/getGroups.sh " + user;
	exec(command, function(err, stdout, stderr) {
		if (err) {
			sys.log("Error in isAdmin: ");
			console.log(err);
			callback( false );
		} else {
			var test = "memberOf: CN=" + env + "Admins";
			if ( (stdout.toLowerCase()).indexOf((test.toLowerCase()) ) >= 0) callback( true );
			else callback( false );
		}
	});
};

// return true if user is 'user' within env account
var isEnvUser = function(username, env, callback) {
	isEnvAdmin(username, env, function(result) {
		if (result == true) { callback( true ); }
		else {
			var user = username.split('\\')[1]; // remove 'aws\' domain prefix from username
			var command = "/home/ec2-user/Projects/conductor/getGroups.sh " + user;
			exec(command, function(err, stdout, stderr) {
				if (err) {
					sys.log("Error in isEnvUser: ");
					console.log(err);
					callback( false );
				} else {
					var test = "memberOf: CN=" + env + "Users";
					if ( (stdout.toLowerCase()).indexOf( (test.toLowerCase()) ) >= 0) callback( true );
					else callback( false );
				}
			});
		}
	});
};

// all before functions receive a single parameter
// 1) the query string as a generic object
conductor.beforeCreate = function(q, username, callback) {
	// if user is not a member of 'users' group or 'admins' group in q.env account
	isEnvUser(username, q.env, function(result) {
		if (result == false) {
			callback({ httpCode: 403, message: 'You are not authorized to create an instance with that configuration.' });
		} else {
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
					sys.log("Error reading instance config from SimpleDB:");
					console.log(err);
					callback({ httpCode: 403, message: 'Error validating instance creation parameters.' });

				}
			});
		}
	});
};
conductor.beforeStart = function(q, username, callback) {
	isAllowed(q.instanceId, username, q.env, function(result) {
		if (!result) callback({ httpCode: 403, message: 'You are not permitted to start instance ' + q.instanceId + '.' });
		else callback({});
	});
};
// TODO: replace with username of currently authenticated user
conductor.beforeStop = function(q, username, callback) {
	isAllowed(q.instanceId, username, q.env, function(result) {
		if (!result) callback({ httpCode: 403, message: 'You are not permitted to stop instance ' + q.instanceId + '.' });
		else callback({});
	});
};
conductor.beforeTerminate = function(q, username, callback) {
	isAllowed(q.instanceId, username, q.env, function(result) {
		if (!result) callback({ httpCode: 403, message: 'You are not permitted to terminate instance ' + q.instanceId + '.' });
		else callback({});
	});
};
conductor.beforeAssociateAddress = function(q, username, callback) {
	// what type of user is allowed to associate elastic IP addresses with instances?
	callback({});
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
conductor.afterAssociateAddress = function(q, httpCode, msg) {
	if (httpCode != 200 || msg.indexOf('success') < 1) return; // don't log to simpledb on failure
	var msgObj = JSON.parse(msg); // make it an object so we can access properties instead of doing text parsing
	sdb.putItem('test_VnvAwsOperationHistory', "" + uuid().toLowerCase(),
		{
			Message: 'ElasticIP: ' + q.ip + ' has been successfully associated to instance ID ' + q.instanceId + ' by ' + msgObj.user + ' via VNC API.',
			Date: (new Date()).format('isoDateTime'),
			Environment: q.env
		},
		function(err, result, meta) {
			if (err) sys.log(err);
		}
	);
};

// override default authentication scheme with ldap authentication
conductor.authenticationScheme = function(username, password, callback) {
	username = username.replace(/([\\"'])/g, "\\$1").replace(/\0/g, "\\0");
	password = password.replace(/([\\"'])/g, "\\$1").replace(/\0/g, "\\0");
	var command = "/home/ec2-user/Projects/test/auth.sh " + username + " " + password;
	
	exec(command, function(err, stdout, stderr) {
		if (err) {
			// test for invalid credentials
			var test = "Invalid credentials";
			err = err.toString();
			if ( (err.toLowerCase()).indexOf(test.toLowerCase()) >= 0 ) callback(null, false);
			// else there was an error but it wasn't invalid credentials. send error back.
			else callback(err, null);
		} else {
			// test for valid credentials
			var test = "Result: Success";
			if ( (stdout.toLowerCase()).indexOf(test.toLowerCase()) >= 0 ) callback(null, true);
			// else credentials must have been invalid
			else callback(null, false);
		}
	});
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
