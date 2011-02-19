var http = require('http'),
	fs = require('fs'),
	router = require('choreographer').router(),
	aws = require('aws-lib');

//read config.json
try {
	var configJSON = fs.readFileSync(__dirname + "/config.json");
	var config = JSON.parse(configJSON.toString());
} catch(e) {
	console.log("File config.json not found. Try: `cp config.json.sample config.json`");
	console.error(e);
}

//setup default variables
var port = (process.env.PORT || config.port) // use env var, otherwise use value from config.json
	, awsKeySet = (process.env.AWS_KEY || config.aws_keys)
	, simpledbKey = (process.env.AWS_SIMPLEDB_KEY || config.aws_simpledb_key)
	, simpledbSecretKey = (process.env.AWS_SIMPLEDB_SECRET || config.aws_simpledb_secret_key);

var getKeys = function(env, awsKeySet) {
	for (var i = 0; i < awsKeySet.length; i++) {
		if (awsKeySet[i].name == env) {
			return { key: awsKeySet[i].key, secretKey: awsKeySet[i].secretKey };
		}
	}
};

// create EC2 instances
var createInstances = function(params, callback) {
	var keys = getKeys(params.env, awsKeySet);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	ec2.call('RunInstances', {/* put some params in here */}, function(result) {
		// parse the result to determine what httpCode to send back
		// parse the result to determine what message to send back
		callback(httpCode, message);
	});
};

// start up existing EC2 instances
var startInstances = function(params, callback) {
	var keys = getKeys(params.env, awsKeySet);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	ec2.call('StartInstances', {'instanceId.1': params.instanceId}, function(result) {
		// parse the result to determine what httpCode to send back
		// parse the result to determine what message to send back
		callback(httpCode, callback);
	});
};

// stop EC2 instance so that it can be re-start later
var stopInstances = function(params, callback) {
	var keys = getKeys(params.env, awsKeySet);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	ec2.call('StopInstances', {'instanceId.1': params.instanceId}, function(result) {
		// parse the result to determine what httpCode to send back
		// parse the result to determine what message to send back
		callback(httpCode, callback);
	});
};

// terminate EC2 instance so that it cannot be started again
var terminateInstances = function(params, callback) {
	var keys = getKeys(params.env, awsKeySet);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	ec2.call('TerminateInstances', {'instanceId.1': params.instanceId}, function(result) {
		// parse the result to determine what httpCode to send back
		// parse the result to determine what message to send back
		callback(httpCode, callback);
	});
};

/////////////////////////////////////////////
// ROUTES
/////////////////////////////////////////////

// ec2 requests require the following URL format
// create: http://0.0.0.0/ec2/<ACTION>?env=&imageId=&instanceType&az=&kernelId=&ramDiskId=&secGroups=&userData=
// where the correct domain is used and <ACTION> is replaced with
// one of create, start, stop, or terminate
// TODO: handle comma separated list of instance IDs
// TODO: handle comma separated list of security groups
router.get('/ec2/*', function(req, res, action) {
	var u = url.parse(req.url, true);
	var q = u.query;
	
	var r = this;
	switch(action) {
		case 'create':
			createInstances(q, function(httpCode, message) {
				res.writeHead(httpCode, { 'Content-Type': 'text/plain' } );
				res.end(message);
			});
			break;
		case 'start':
			startInstances(q, function(httpCode, message) {
				res.writeHead(httpCode, { 'Content-Type': 'text/plain' } );
				res.end(message);
			});
			break;
		case 'stop':
			stopInstances(q, function(httpCode, message) {
				res.writeHead(httpCode, { 'Content-Type': 'text/plain' } );
				res.end(message);
			});
			break;
		case 'terminate':
			terminateInstances(q, function(httpCode, message) {
				res.writeHead(httpCode, { 'Content-Type': 'text/plain' } );
				res.end(message);
			});
			break;
		default:
			r.notFound(notFound);
	}
	
	
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end("The instance a-89eb98be was succesfully started.");
})
.notFound(notFound);

var notFound = function(req, res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
	res.end('404: Whatever you\'re trying to do isn\'t going to work here.');
};

http.createServer(router).listen(port);