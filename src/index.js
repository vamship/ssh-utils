'use strict';

/**
 * SSH utility module that allows the transfer of files and execution of
 * commands on a remote server over SSH.
 */
module.exports = {
    /**
     * Client object that allows execution of remote commands over ssh.
     */
    SshClient: require('./ssh-client')
};
