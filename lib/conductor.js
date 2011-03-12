var sys = require('sys'),
	url = require('url'),
	router = require('choreographer').router(),
	aws = require('aws-lib'),
	nodemailer = require('Nodemailer'),
	auth = require('http-auth');

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
		sys.log("Error in getInstanceStatus: " + e.message);
		callback('error', null, true)
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
					if (err) console.log(err);
				}
			);
		}
		
		// send the email with the status and public URL of the instance
		if (currentStatus == status) {
			clearInterval(intervalId);
			if (status == 'running') body = "The EC2 insatnce " + instanceId + " is " + status + " and accessible at rdp://" + address;
			else body = "The EC2 instance " + instanceId + " is " + status + ".";
			nodemailer.send_mail({
				sender: "chris.castle@vivakinervecenter.com",
				to: email,
				subject: "EC2 instance " + instanceId + " is " + status,
				body: body
				},
				function(err, success) {
					sys.log("Instance status email " + (success?"sent":"failed") + " to " + email + " regarding instance " + instanceId);
					if (err) console.log(err);
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
var createInstances = function(params, username, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		sys.log("Exception in createInstances " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
	}
	
	var createParams = { 'ImageId': params.imageId,
						 'MinCount': 1,
						 'MaxCount': 1,
						 'KeyName': params.keyPair,
						 //'UserData': params.userData,
						 'InstanceType': params.instanceType,
						 'Placement.AvailabilityZone': params.az
						};
	// remove open and close bracket characters
	var secGroupsTemp = params.secGroups.replace(/\[+|\]+/g, '');
	
	// remove spaces
	secGroupsTemp = secGroupsTemp.replace(/\s+/g, '');
	
	// break comma separated string into array
	secGroupsTemp = secGroupsTemp.split(',');
	
	// format security groups as needed by EC2 api
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
				var instanceProperties = result['instancesSet']['item'];
				var instanceId = instanceProperties['instanceId'];
				var status = instanceProperties['instanceState']['name'];
				msg.data = { message: instanceId + ' is now ' + status, instanceId: instanceId, user: username };
				params.instanceId = instanceId; //add instanceId to query string object so it can be used by afterAction
				//TODO: apply instance tags and then call callback below...
				sys.log("createInstances: " + JSON.stringify(msg));
				callback(200, JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				sys.log("400 error in createInstances: " + JSON.stringify(msg));
				callback(400, JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				sys.log("500 error in createInstances: " + JSON.stringify(msg));
				console.log(result);
				callback(500, JSON.stringify(msg));
			}
		});
	} catch(e) {
		sys.log("Exception in createInstances: " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: e.message }))
	}
};

// start up existing EC2 instances
var startInstances = function(params, username, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		sys.log("Exception in startInstances " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
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
				msg.data = { message: instanceId + ' is now ' + status, instanceId: instanceId, user: username };
				sys.log("startInstances: " + JSON.stringify(msg));
				callback(200, JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				sys.log("400 error in startInstances: " + JSON.stringify(msg));
				callback(400, JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				sys.log("500 error in startInstances: " + JSON.stringify(msg));
				callback(500, JSON.stringify(msg));
			}
		});
	} catch(e) {
		sys.log("Exception in startInstances: " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: e.message }))
	}
};

// stop EC2 instance so that it can be re-start later
var stopInstances = function(params, username, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		sys.log("Exception in stopInstances: " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
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
				msg.data = { message: instanceId + ' is now ' + status, instanceId: instanceId, user: username };
				sys.log("stopInstances: " + JSON.stringify(msg));
				callback(200, JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				sys.log("400 error in stopInstances: " + JSON.stringify(msg));
				callback(400, JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				sys.log("500 error in stopInstances: " + JSON.stringify(msg));
				callback(500, JSON.stringify(msg));
			}
		});
	} catch(e) {
		sys.log("Exception in stopInstances: " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: e.message }));
	}
};

// terminate EC2 instance so that it cannot be started again
var terminateInstances = function(params, username, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		sys.log("Exception in terminateInstances " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
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
				msg.data = { message: instanceId + ' is now ' + status, instanceId: instanceId, user: username };
				sys.log("terminateInstances: " + JSON.stringify(msg));
				callback(200, JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				sys.log("400 error in terminateInstances: " + JSON.stringify(msg));
				callback(400, JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				sys.log("500 error in terminateInstances: " + JSON.stringify(msg));
				callback(500, JSON.stringify(msg));
			}
		});
	} catch(e) {
		sys.log("Exception in terminateInstances: " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: e.message }));
	}
};

var associateAddress = function(params, username, callback) {
	try {
		var keys = getKeys(params.env);
		var ec2 = aws.createEC2Client(keys.key, keys.secretKey);
	} catch(e) {
		sys.log("Exception in terminateInstances " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: "Error reading or using AWS key." }));
	}
	
	try {
		ec2.call('AssociateAddress', { 'PublicIp': params.ip, 'InstanceId': params.instanceId }, function(result) {
			var msg = {};
			if (result.return && result.return == "true") {
				msg.status = 'success';
				msg.data = { message: 'IP address ' + params.ip + ' is now being associated with instance ID ' + params.instanceId,
								instanceId: instanceId, user: username };
				sys.log("associateAddress: " + JSON.stringify(msg));				
				callback(200, JSON.stringify(msg));
			} else if (result.Errors) {
				msg.status = 'fail';
				msg.data = { message: result.Errors.Error.Message };
				sys.log("400 error in associateAddress: " + JSON.stringify(msg));
				callback(400, JSON.stringify(msg));
			} else {
				msg.status = 'error';
				msg.message = 'An internal error occured. Please try again.';
				sys.log("500 error in associateAddress: " + JSON.stringify(msg));
				callback(500, JSON.stringify(msg));
			}
		});
	} catch(e) {
		sys.log("Exception in associateAddress: " + e.message);
		callback(500, JSON.stringify({ status: 'error', message: e.message }));
	}
};

var beforeAction = function(initialQuery, username, befAct, callback) {
	if (befAct) befAct(initialQuery, username, function(result) {
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
	
	// log the request for security
	try {
		var ipAddress = req.socket.socket.remoteAddress;
		req.connection.remoteAddress = ipAddress;
	} catch(e) {
	}
	sys.log("Request for " + req.url + " from " + req.connection.remoteAddress);
	
	// grab 'this' for future use
	var r = this;
	
	var notAuthenticatedCallback = function() {
		res.writeHead(401, {'WWW-Authenticate': 'Basic realm="Conductor AWS EC2 API"'});
		res.end();
		return;
	}
	
	var authenticatedCallback = function(username) {
		var u = url.parse(req.url, true);
		var q = u.query;
		switch(action) {
			case 'create':
				beforeAction(q, username, exports.beforeCreate, function(check) {
					if (check.httpCode && check.message) {
						returnResponse(null, check.httpCode, check.message, res, null);
					} else {
						createInstances(q, username, function(httpCode, message) {
							returnResponse(q, httpCode, message, res, exports.afterCreate);
							if (q.email) sendEmailWhen(q.instanceId, q.env, 'running', q.email);
						});
					}
				});
				break;
			case 'start':
				beforeAction(q, username, exports.beforeStart, function(check) {
					if (check.httpCode && check.message) {
						returnResponse(null, check.httpCode, check.message, res, null);
					} else {
						startInstances(q, username, function(httpCode, message) {
							returnResponse(q, httpCode, message, res, exports.afterStart);
							if (q.email) sendEmailWhen(q.instanceId, q.env, 'running', q.email);
						});
					}
				});
				break;
			case 'stop':
				beforeAction(q, username, exports.beforeStop, function(check) {
					if (check.httpCode && check.message) {
						returnResponse(null, check.httpCode, check.message, res, null);
					} else {
						stopInstances(q, username, function(httpCode, message) {
							returnResponse(q, httpCode, message, res, exports.afterStop);
							if (q.email) sendEmailWhen(q.instanceId, q.env, 'stopped', q.email);
						});
					}
				});
				break;
			case 'terminate':
				beforeAction(q, username, exports.beforeTerminate, function(check) {
					if (check.httpCode && check.message) {
						returnResponse(null, check.httpCode, check.message, res, null);
					} else {
						terminateInstances(q, username, function(httpCode, message) {
							returnResponse(q, httpCode, message, res, exports.afterTerminate);
							if (q.email) sendEmailWhen(q.instanceId, q.env, 'terminated', q.email);
						});
					}
				});
				break;
			case 'associateAddress':
				beforeAction(q, username, exports.beforeAssociateAddress, function(check) {
					if (check.httpCode && check.message) {
						returnResponse(null, check.httpCode, check.message, res, null);
					} else {
						associateAddress(q, username, function(httpCode, message) {
							returnResponse(q, httpCode, message, res, exports.afterAssociateAddress);
							// TODO: add ability to send email notification
						});
					}
				});
			default:
				r.notFound(notFound);
		}
	}
	
	// require authentication
	exports.authenticationScheme = auth.authenticationScheme;
	auth.authenticate(req, exports.config, notAuthenticatedCallback, authenticatedCallback);
})
.notFound(notFound);

exports.router = router;