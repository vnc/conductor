var http = require('http'),
	router = require('choreographer').router();


// ec2 requests require the following URL format
// create: http://0.0.0.0/ec2/<ACTION>?imageId=&instanceType&az=&kernelId=&ramDiskId=&securityGroups=&
// where the correct domain is used and <ACTION> is replaced with
// one of create, start, stop, or terminate
// TODO: allow comma separated list of instance IDs also
router.get('/ec2/create', function(req, res) {
	var u = url.parse(req.url, true);
	var queryString = u.query;
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end("The instance a-89eb98be was succesfully started.");
})
.get('/ec2/start', function(req, res) { // start: http://0.0.0.0/ec2/start?instanceId=
	
})
.get('/ec2/stop', function(req, res) { // stop: http://0.0.0.0/ec2/stop?instanceId=
	
})
.get('/ec2/terminate', function(req, res) { // stop: http://0.0.0.0/ec2/terminate?instanceId=
	
})
.notFound(function(req, res)
{
	res.writeHead(404, {'Content-Type': 'text/plain'});
	res.end('404: Man.... look what you did! You done gone broke this thing.  I\'m tellin. \n' +
		'No seriously, you attempt has been logged, and the proper authorities have been notified.');
});

http.createServer(router).listen(8080);