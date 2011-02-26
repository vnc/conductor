# Conductor

## About

Conductor is a simple node.js web service to create, start, stop, and terminate EC2 instances. Conductor also allows you to define your own actions to perform on success and/or failure of the EC2 API request.  For instance you can do an authorization check on 'user.bob' before allowing an instance to be started.  And you could then log the fact that an instance was started by 'user.bob' after the request has completed.

## Features
 * simplify EC2 api requests to create/start/stop/terminate EC2 instaces
 * one api call (instead of two with AWS EC2 api) to create instance and assign instance tags
 * supports multiple AWS accounts natively (see config.json.sample)
 * optional email notification when instance has reached requested state (e.g. stopping -> stopped)
 * simple JSON response
 * easily add custom validation or authorization checks before making AWS EC2 api call
 * easily add custom actions on success or failure of AWS EC2 api request
 * requires HTTP AUTH Basic (set username and password in config.json.sample)
 * can use LDAP and Active Directory as custom authorization (see server.example.json)
 * can use HTTPS or HTTP (see server.example.js)

## Dependencies

#### Dependencies you need to figure out
 * [node.js](https://github.com/ry/node) (v0.4.1)

#### The dependencies below are installed automatically (as git submodules) using the installation instructions below.
 * [choreogrpaher](https://github.com/laughinghan/choreographer) (simple request router)
 * [aws-lib](https://github.com/mirkok/aws-lib) (speaks to the EC2 api)
 * [Nodemailer](https://github.com/andris9/Nodemailer) (to send email notifications once instance has started/stopped)
 * [simpledb](https://github.com/rjrodger/simpledb) (needed only for server.example.js)
 * [xml2js](https://github.com/maqr/node-xml2js/) (needed only for server.example.js)
 * [sax](https://github.com/isaacs/sax-js/) (needed only for server.example.js)

## Installation

    $ git clone git://github.com/crcastle/conductor.git
    $ cd conductor

	# Update submodules
	$ git submodule update --init --recursive

	# open conductor/lib/aws-lib/lib/ec2.js
	# change the date on line 25 to 2010-11-15
	# if you don't do this, you'll get exceptions

	# Copy server.default.js
	$ cp server.default.js server.js

    # Copy the default configuration file
	# and add your AWS account credentials and mail server info
	# simpledb credentials are needed to run server.example.js
    $ cp config.json.sample config.json

	# Look at server.example.js for how the "before" and "after" actions can be defined and used

## Running

	$ node server.js
	# or for a more complex setup do
	$ node server.example.js
	# but note the additional dependencies mentioned above for this
