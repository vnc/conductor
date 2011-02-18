var http = require('http'),
	fs = require('fs'),
	router = require('choreographer').router(),
	ec2 = require('aws-lib').createEC2Client(key, secretKey);

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
		
// ec2 requests require the following URL format
// create: http://0.0.0.0/ec2/<ACTION>?imageId=&instanceType&az=&kernelId=&ramDiskId=&secGroups=&userData=
// where the correct domain is used and <ACTION> is replaced with
// one of create, start, stop, or terminate
// TODO: allow comma separated list of instance IDs also
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

http.createServer(router).listen(8080);