# Conductor

## About

Conductor is a simple web service to create, start, stop, and terminate EC2 instances. Conductor also allows you to define your own actions to perform on success and/or failure of the EC2 API request.

## Dependencies

#### Dependencies you need to figure out
 * [node.js](https://github.com/ry/node)

#### The dependencies below are installed automatically (as git submodules) using the installation instructions below.
 * [choreogrpaher](https://github.com/laughinghan/choreographer)
 * [aws-lib](https://github.com/mirkok/aws-lib)
 * [simpledb](https://github.com/rjrodger/simpledb)
 * [xml2js](https://github.com/maqr/node-xml2js/)
 * [sax](https://github.com/isaacs/sax-js/)

## Installation

    $ git clone git://github.com/crcastle/conductor.git
    $ cd conductor

	# Update submodules
	$ git submodule update --init --recursive

    # Copy the default configuration file
	# and add your AWS account credentials
	# note that credentials are defined separately for ec2 and simpledb
    $ cp config.json.sample config.json

	# open conductor/lib/aws-lib/lib/ec2.js
	# change the date on line 25 to 2010-11-15
	# if you don't do this, instance tags will not be set or read

## Running

	$ node server.js
