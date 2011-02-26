var sys = require('sys'),
	url = require('url'),
	router = require('choreographer').router(),
	aws = require('aws-lib'),
	nodemailer = require('Nodemailer');

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
	
	for (var i = 0; i < awsKeySet.length; i++) {
		if (awsKeySet[i].name == env) {
			return { key: awsKeySet[i].keys.key, secretKey: awsKeySet[i].keys.secretKey };
		}
	}
};

// get status of an instance
var getInstanceStatus = function(instanceId, keys, callback) {
	var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	
	try {
		ec2.call('DescribeInstances',
				{'Filter.1.Name': 'instance-id', 'Filter.1.Value': instanceId},
				function(result) {
					var instanceProperties = result['reservationSet']['item']['instancesSet']['item'];
					var instanceStatus = (instanceProperties['instanceState']) ? instanceProperties['instanceState']['name'] : "";
					var address = (instanceProperties['dnsName']) ? instanceProperties['dnsName'] : "";
					callback(instanceStatus, address, null);
				});
	} catch(e) {
		callback('error', null, true)
		sys.log("Error in getInstanceStatus: " + e.message);
	}
};

// send an email to 'email' when the status of 'instanceId' matches 'status'
var sendEmailWhen = function(instanceId, env, status, email) {
	// configure nodemailer with SMTP server info
	nodemailer.SMTP = {
		host: exports.config.email.host,
		port: exports.config.email.port,
		ssl: exports.config.email.ssl,
		use_authentication: exports.config.email.use_auth,
		user: exports.config.email.user,
		pass: exports.config.email.pass
	};
	
	var callback = function(currentStatus, address, err) {
		if (err) { // send an error email if the EC2 API query fails
			clearInterval(intervalId);
			nodemailer.send_mail({
				sender: "chris.castle@vivakinervecenter.com",
				to: email,
				subject: "EC2 error querying instance status",
				body: "There was an error getting the status or URL of the instance " + instanceId + ". Please manually check the instance status."
				},
				function(err, success) {
					sys.log("Error email " + (success?"sent":"failed") + " to " + email + " regarding instance " + instanceId);
					if (err) sys.log(JSON.stringify(err));
				}
			);
		}
		
		// send the email with the status and public URL of the instance
		if (currentStatus == status) {
			clearInterval(intervalId);
			if (status == 'running') body = "The EC2 insatnce " + instanceId + " is " + status + " and accessible at " + address;
			else body = "The EC2 instance " + instanceId + " is " + status + ".";
			nodemailer.send_mail({
				sender: "chris.castle@vivakinervecenter.com",
				to: email,
				subject: "EC2 instance " + instanceId + " is " + status,
				body: body
				},
				function(err, success) {
					sys.log("Instance status email " + (success?"sent":"failed") + " to " + email + " regarding instance " + instanceId);
					if (err) sys.log(JSON.stringify(err));
				}
			);
		}
	};
	
	// query the instance status every 30 seconds
	var keys = getKeys(env);
	getInstanceStatus(instanceId, keys, callback);
	var intervalId = setInterval(getInstanceStatus, 30000, instanceId, keys, callback);
};

// create EC2 instances
var createInstances = function(params, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
		sys.log("Exception in stopInstances " + e.message);
	}
	
	var createParams = { 'ImageName': params.imageName,
						 'MinCount': 1,
						 'MaxCount': 1,
						 'KeyName': params.keyName,
						 'UserData': params.userDate,
						 'InstanceType': params.instanceType,
						 'Placement.AvailabilityZone': params.az
						};
	
	var secGroupsTemp = params.secGroups.split(',');
	for (var i = 0; i < secGroupsTemp.length; i++) {
		createParams['SecurityGroup.'+i] = secGroupsTemp[i];
	}
		
	try {
		ec2.call('RunInstances', createParams, function(result) {
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

// start up existing EC2 instances
var startInstances = function(params, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
		sys.log("Exception in stopInstances " + e.message);
	}
	
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
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
		sys.log("Exception in stopInstances " + e.message);
	}
	
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
		callback(500, JSON.stringify({ status: 'error', message: e.message }));
		sys.log("Exception in stopInstances: " + e.message);
	}
};

// terminate EC2 instance so that it cannot be started again
var terminateInstances = function(params, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
		sys.log("Exception in stopInstances " + e.message);
	}
	
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

var beforeAction = function(initialQuery, befAct, callback) {
	if (befAct) befAct(initialQuery, function(result) {
		callback(result);
	});
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
// create: http://0.0.0.0/ec2/<ACTION>?env=&imageId=&minCount=&maxCount=&keyName=&instanceType&az=&secGroups=&userData=
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
			beforeAction(q, exports.beforeCreate, function(check) {
				if (check.httpCode && check.message) {
					returnResponse(null, check.httpCode, check.message, res, null);
				} else {
					createInstances(q, function(httpCode, message) {
						returnResponse(q, httpCode, message, res, exports.afterCreate);
						if (q.email) sendEmailWhen(q.instanceId, q.env, 'running', q.email);
					});
				}
			});
			break;
		case 'start':
			beforeAction(q, exports.beforeStart, function(check) {
				if (check.httpCode && check.message) {
					returnResponse(null, check.httpCode, check.message, res, null);
				} else {
					startInstances(q, function(httpCode, message) {
						returnResponse(q, httpCode, message, res, exports.afterStart);
						if (q.email) sendEmailWhen(q.instanceId, q.env, 'running', q.email);
					});
				}
			});
			break;
		case 'stop':
			beforeAction(q, exports.beforeStop, function(check) {
				if (check.httpCode && check.message) {
					returnResponse(null, check.httpCode, check.message, res, null);
				} else {
					stopInstances(q, function(httpCode, message) {
						returnResponse(q, httpCode, message, res, exports.afterStop);
						if (q.email) sendEmailWhen(q.instanceId, q.env, 'stopped', q.email);
					});
				}
			});
			break;
		case 'terminate':
			beforeAction(q, exports.beforeTerminate, function(check) {
				if (check.httpCode && check.message) {
					returnResponse(null, check.httpCode, check.message, res, null);
				} else {
					terminateInstances(q, function(httpCode, message) {
						returnResponse(q, httpCode, message, res, exports.afterTerminate);
						if (q.email) sendEmailWhen(q.instanceId, q.env, 'terminated', q.email);
					});
				}
			});
			break;
		default:
			r.notFound(notFound);
	}
	
})
.notFound(notFound);

exports.router = router;