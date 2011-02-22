var sys = require('sys'),
	url = require('url'),
	router = require('choreographer').router(),
	aws = require('aws-lib');

// setup defaults that need to be defined by user
exports.config = config = null;

exports.beforeCreate = beforeStop = null;
exports.beforeStart = beforeStart = null;
exports.beforeStop = beforeStop = null;
exports.beforeTerminate = beforeTerminate = null;

exports.afterCreate = afterCreate = null;
exports.afterStart = afterStop = null;
exports.afterStop = afterStop = null;
exports.afterTerminate = afterTerminate = null;

// get the keys for the specified 'environment'
// this allows support for multiple AWS accounts
var getKeys = function(env) {
	if (exports.config) var awsKeySet = exports.config.aws_keys;
	try {
		for (var i = 0; i < awsKeySet.length; i++) {
			if (awsKeySet[i].name == env) {
				return { key: awsKeySet[i].keys.key, secretKey: awsKeySet[i].keys.secretKey };
			}
		}
	} catch(e) {
		console.log('error reading AWS keys from config.json');
		console.error(e.message);
	}
};

// create EC2 instances
var createInstances = function(params, callback) {
	var keys = getKeys(params.env);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	ec2.call('RunInstances', {/* put some params in here */}, function(result) {
		// parse the result to determine what httpCode to send back
		// parse the result to determine what message to send back
		callback(httpCode, message);
	});
};

// start up existing EC2 instances
var startInstances = function(params, callback) {
	var keys = getKeys(params.env);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	try {
		ec2.call('StartInstances', {'InstanceId.1': params.instanceId}, function(result) {
			// parse the result to determine what httpCode to send back
			// parse the result to determine what message to send back
			var msg = {};
			if (result.instancesSet) {
				msg.status = 'success';
				var instanceId = result.instancesSet.item.instanceId;
				var status = result.instancesSet.item.currentState.name;
				msg.data = { message: instanceId + ' is now ' + status };
				callback(200, JSON.stringify(msg));
				sys.log("startInstances: " + JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				callback(400, JSON.stringify(msg));
				sys.log("400 error in startInstances: " + JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				callback(500, JSON.stringify(msg));
				sys.log("500 error in startInstances: " + JSON.stringify(msg));
			}
		});
	} catch(e) {
		callback(500, JSON.stringify({ status: 'error', message: e.message }))
		sys.log("Exception in startInstances: " + e.message);
	}
};

// stop EC2 instance so that it can be re-start later
var stopInstances = function(params, callback) {
	var keys = getKeys(params.env);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	try {
		ec2.call('StopInstances', {'InstanceId.1': params.instanceId}, function(result) {
			// parse the result to determine what httpCode to send back
			// parse the result to determine what message to send back
			var msg = {};
			if (result.instancesSet) {
				msg.status = 'success';
				var instanceId = result.instancesSet.item.instanceId;
				var status = result.instancesSet.item.currentState.name;
				msg.data = { message: instanceId + ' is now ' + status };
				callback(200, JSON.stringify(msg));
				sys.log("stopInstances: " + JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				callback(400, JSON.stringify(msg));
				sys.log("400 error in stopInstances: " + JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				callback(500, JSON.stringify(msg));
				sys.log("500 error in stopInstances: " + JSON.stringify(msg));
			}
		});
	} catch(e) {
		callback(500, JSON.stringify({ status: 'error', message: e.message }))
		sys.log("Exception in stopInstances: " + e.message);
	}
};

// terminate EC2 instance so that it cannot be started again
var terminateInstances = function(params, callback) {
	var keys = getKeys(params.env);
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	try {
		ec2.call('TerminateInstances', {'InstanceId.1': params.instanceId}, function(result) {
			// parse the result to determine what httpCode to send back
			// parse the result to determine what message to send back
			var msg = {};
			if (result.instancesSet) {
				msg.status = 'success';
				var instanceId = result.instancesSet.item.instanceId;
				var status = result.instancesSet.item.currentState.name;
				msg.data = { message: instanceId + ' is now ' + status };
				callback(200, JSON.stringify(msg));
				sys.log("terminateInstances: " + JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				callback(400, JSON.stringify(msg));
				sys.log("400 error in terminateInstances: " + JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				callback(500, JSON.stringify(msg));
				sys.log("500 error in terminateInstances: " + JSON.stringify(msg));
			}
		});
	} catch(e) {
		callback(500, JSON.stringify({ status: 'error', message: e.message }))
		sys.log("Exception in terminateInstances: " + e.message);
	}
};

var beforeAction = function(initialQuery, befAct) {
	if (befAct) return befAct(initialQuery);
	return false;
};

var returnResponse = function(initialQuery, httpCode, message, responseObj, afterAction) {
	if (afterAction) afterAction(initialQuery, httpCode, message);
	responseObj.writeHead(httpCode, { 'Content-Type': 'text/plain' });
	responseObj.end(message);
};

// default behavior if request is for an unknown route
var notFound = function(req, res) {
	res.writeHead(404, { 'Content-Type': 'text/plain' });
	res.end('404: Whatever you\'re trying to do isn\'t going to work here.');
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
			var check = beforeAction(q, exports.beforeCreate);
			if (check) { // do not continue if returns true
				returnResponse(q, check.httpCode, check.message, res, null);
				break;
			}
			createInstances(q, function(httpCode, message) {
				returnResponse(q, httpCode, message, res, exports.afterCreate);
			});
			break;
		case 'start':
			var check = beforeAction(q, exports.beforeStart);
			if (check) { // do not continue if returns true
				returnResponse(q, check.httpCode, check.message, res, null);
				break;
			}
			
			startInstances(q, function(httpCode, message) {
				returnResponse(q, httpCode, message, res, exports.afterStart);
			});
			break;
		case 'stop':
			var check = beforeAction(q, exports.beforeStop);
			if (check) { // do not continue if returns true
				returnResponse(q, check.httpCode, check.message, res, null);
				break;
			}
			
			stopInstances(q, function(httpCode, message) {
				returnResponse(q, httpCode, message, res, exports.afterStop);
			});
			break;
		case 'terminate':
			var check = beforeAction(q, exports.beforeTerminate);
			if (check) { // do not continue if returns true
				returnResponse(q, check.httpCode, check.message, res, null);
				break;
			}
			
			terminateInstances(q, function(httpCode, message) {
				returnResponse(q, httpCode, message, res, exports.afterTerminate);
			});
			break;
		default:
			r.notFound(notFound);
	}
	
})
.notFound(notFound);

exports.router = router;