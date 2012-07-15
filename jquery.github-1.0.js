/*
 * jquery-github
 * https://github.com/alebellu/jquery-github
 *
 * Copyright 2012 Alessandro Bellucci
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * http://alebellu.github.com/jquery-github/GPL-LICENSE.txt
 * http://alebellu.github.com/jquery-github/MIT-LICENSE.txt
 */

(function($) {

  var api = "https://api.github.com";

  var auth;

  var error_codes = {
  	// Ajax errors
  	AJAX_REQUEST_FAILED: [ "ERR-AJAX-001", "An error occurred during ajax request" ],

	// Authorization error
	NEEDS_AUTHENTICATION: [ "ERR_AUTH_001", "Authentication to GitHub is needed to perform this operation" ],

	// OAuth errors
  	ERROR_RETRIEVING_OAUTH_TEMPORARY_CODE: [ "ERR_OAUTH_001", "An error occurred retrieving OAuth temporary code" ],
  	ERROR_RETRIEVING_OAUTH_TOKEN: [ "ERR_OAUTH_002", "An error occurred retrieving OAuth token form GitHub servers" ],

	// Commit errors
	COMMIT_OBJECT_NOT_FOUND: [ "ERR_COMMIT_001", "Commit object not found" ],
  };

  var methods = {
	init: function( options ) {
	},

	/**
	 * Gets/sets encoded credentials in the form required by http basic authentication, user:pwd base64 encoded.
	 *
	 * @credentials
	 */
	auth: function( authOptions ) {
		if ( authOptions ) {
			auth = authOptions;
		}
		return auth;
	},

	oauth: function( options ) {
		var dr = $.Deferred();

		auth = { type: 'oauth' };

		var oauthURL = "https://github.com/login/oauth/authorize?" +
			"client_id=" + options.client_id +
			"&scope=" + options.scope;

		$( window ).on( 'message', function(event) {
			var message = event.originalEvent.data;
			if ( message.origin == 'github_oauth' ) {
				if ( auth.code ) {
					// this is to work around multiple calls to window on message
					return;
				}

				if ( message.error ) {
					drf( dr, "ERROR_RETRIEVING_OAUTH_TEMPORARY_CODE", error );
				} else {
					auth.code = message.code;
					auth.state = message.state;
					drp( dr, auth );

					jQuery.ajax( {
						url: options.github_oauth_tunnel,
						type: 'GET',
						data: {
							client_id: options.client_id,
							code: message.code,
							state: message.state
						},
						dataType: "json",
						cache: false
					} ).done( function ( token ) {
						if ( token.error ) {
							drf( dr, "ERROR_RETRIEVING_OAUTH_TOKEN", token.error );
						} else {
							auth.access_token = token.access_token;
							drd( dr, auth );
						}
					} ).fail( drfa( dr ) );
				}
			}
		});

		// open a new window for authentication
		window.open( oauthURL );

		return dr.promise();
	},

	authorized: function() {
		return getUrlVars().code != undefined;
	},

	/**
	 * Returns the github raw URL of a given resource.
	 */
	raw: function( user, repo, tag, path ) {
		return "https://raw.github.com/" + user + "/" + repo + "/" + tag + "/" + path;
	},

	/**
	* Gets info for a given tree, given a tree sha/tag name and optionally a path relative to it.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@tree either the name of a tag or the sha of a tag/tree to retrieve/update
	*	@path the root path of the tree
	* 	@new_tree Array of Hash objects (of path, mode, type and sha/content) specifying a tree structure
	* @returns a deferred for the call; callback will yield a tree object
	*/
	tree: function( options ) {
		if ( options.new_tree ) {
			var dr = $.Deferred();

			if ( checkAuth( dr ) ) {
				// POST a new tree
				post( api + "/repos/" + options.user + "/" + options.repo + "/git/trees", {
					base_tree: options.tree,
					tree: options.new_tree
				} ).done( drdf( dr ) ).fail( drff( dr ) );
			}

			return dr.promise();
		} else {
			// GETS a tree
			if ( options.path ) {
				return $( this ).github( 'treeAtPath', options );
			} else {
				return get( api + "/repos/" + options.user + "/" + options.repo + "/git/trees/" + options.tree );
			}
		}
	},

	/**
	* Gets info for a given path.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@tree either the name of a tag or the sha of a tag/path
	* 	@path the path
	* @returns a deferred for the call; callback will yield a tree object
	*/
	treeAtPath: function( options ) {
		var dr = $.Deferred();

		var path = cleanPath(options.path);

		var opt = $.extend( {}, options );
		delete opt.path;
		$( this ).github( 'tree', opt )
			.done( function( tree ) {
				if ( path ) {
					// still path levels to navigate to..
					var indexOfSlash = path.indexOf( '/' );
					var firstLevel;
					if ( indexOfSlash > 0 ) {
						firstLevel = path.substring( 0, indexOfSlash );
						path = path.substring( indexOfSlash + 1 );
					} else {
						firstLevel = path;
						path = null;
					}

					// ...look for the sha of first level directory in the path..
					var firstLevelSHA;
					for ( var i = 0; i < tree.tree.length; i ++) {
						if (tree.tree[i].type == 'tree' && tree.tree[i].path == firstLevel) {
							firstLevelSHA = tree.tree[i].sha;
						}
					}

					if ( firstLevelSHA ) {
						// ..navigate down one level
						$( this ).github( 'treeAtPath', {
							user: options.user,
							repo: options.repo,
							tree: firstLevelSHA,
							path: path
						} ).done( drdf( dr ) ).fail( drff( dr ) );
					} else {
						drf( dr );
					}
				} else {
					// got it
					dr.resolveWith( this, [tree] );
				}
			} )
			.fail( drff( dr ) );

		return dr.promise();
	},

	/**
	* Get blob content given its sha or a tree and the path of the blob relative to that tree.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@sha sha of the blob
	* 	@tree sha of a tree object containing the blob
	* 	@path the path of the blob to retrieve, with respect to the tree object
	* @returns a deferred for the call; callback will yield a blob object
	*/
	blob: function( options ) {
		var path = cleanPath( options.path );
		if ( path ) {
			return $( this ).github( 'blobAtPath', options );
		} else {
			return get( api + "/repos/" + options.user + "/" + options.repo + "/git/blobs/" + options.sha );
		}
	},

	/**
	* Get blob content given a tree and the path of the blob relative to that tree.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@tree either the name of a tag or the sha of a tag/path
	* 	@path the path
	* @returns a deferred for the call; callback will yield a blob object
	*/
	blobAtPath: function( options ) {
		var dr = $.Deferred();

		var path = cleanPath(options.path);
		// extract last blob name from path
		var indexOfSlash = path.lastIndexOf( '/' );
		var blobName;
		if ( indexOfSlash > 0 ) {
			blobName = path.substring( indexOfSlash + 1 );
			path = path.substring( 0, indexOfSlash );
		} else {
			blobName = path;
			path = null;
		}

		var opt = $.extend( {}, options );
		opt.path = path;
		$( this ).github( 'tree', opt )
			.done( function( tree ) {
				// look for the blob sha
				var sha;
				for ( var i = 0; i < tree.tree.length; i ++) {
					if ( tree.tree[i].type == 'blob' && tree.tree[i].path == blobName ) {
						sha = tree.tree[i].sha;
					}
				}
	
				// retrieve the blob
				opt = $.extend( {}, options );
				delete opt.tree;
				delete opt.path;
				opt.sha = sha;
				$( this ).github( 'blob', opt ).done( drdf( dr ) ).fail( drff( dr ) );
			} )
			.fail( drff( dr ) );

		return dr.promise();
	},

	/**
	* Gets/sets a reference object.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@ref the reference to retrieve/update
	* 	@sha sha of the object this ref will point to
	* @returns a deferred for the call; callback will yield a reference object
	*/
	ref: function( options ) {
		if ( options.sha ) {
			var dr = $.Deferred();

			if ( checkAuth( dr ) ) {
				// POST
				post( api + "/repos/" + options.user + "/" + options.repo + "/git/refs/" + options.ref, {
					sha: options.sha
				} ).done( drdf( dr ) ).fail( drff( dr ) );
			}

			return dr.promise();
		} else {
			// GET
			return get( api + "/repos/" + options.user + "/" + options.repo + "/git/refs/" + options.ref );
		}
	},

	/**
	* Gets or post a commit object.
	* In the case of a get an sha or reference to the commit object to retrieve has to be specified.
	* In the case of a post an sha or reference to the parent commit object has to be specified.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@sha sha of the commit object to retrieve/update
	*	@commit_ref ref to a commit object
	*	@tree either the name of a tag or the sha of the tree to associate to the commit object.
	* 	@new_tree Array of Hash objects (of path, mode, type and sha/content) specifying a tree structure to
	* 	      associate to the new commit object.
	*	@message the commit message
	*	@ref the reference to the commit object to retrieve/update
	* @returns a deferred for the call; callback will yield a commit object
	*/
	commit: function( options ) {
		if ( options.sha ) {
			// an sha for the commit was specified
			if ( options.tree ) {
				var dr = $.Deferred();

				if ( checkAuth( dr ) ) {
					// POST a commit object
					if ( !options.new_tree ) {
						$( this ).github( 'commitTree', options )
							.done( drdf( dr ) ).fail( drff( dr ) );
					} else {
						// a new tree has to be created first
						var dr = $.Deferred();
	
						$( this ).github( 'tree', options )
							.done( function( tree ) {
								var opt = $.extend( {}, options );
								delete opt.new_tree;
								opt.tree = tree.sha;
								$( this ).github( 'commit', opt )
									.done( drdf( dr ) ).fail( drff( dr ) );
							} )
							.fail( drff( dr ) );	
					}
				}

				return dr.promise();
			} else {
				// GET a commit object
				return get( api + "/repos/" + options.user + "/" + options.repo + "/commits/" + options.sha );
			}
		} else if ( options.commit_ref  ) {
			// resolve commit sha first
			var dr = $.Deferred();

			var opt = $.extend( { ref: options.commit_ref }, options );
			delete opt.commit_ref;
			$( this ).github( 'ref', opt )
				.done( function( ref ) {
					if ( ref.object && ref.object.type == 'commit' ) {
						opt.sha = ref.object.sha;
						$( this ).github( 'commit', opt ).done( drdf( dr ) ).fail( drff( dr ) );
					} else {
						// commit object not found
						drf( dr, "COMMIT_OBJECT_NOT_FOUND" );
					}
				} )
				.fail( drff( dr ) );

			return dr.promise();
		} else {
			// either sha or commit ref has to be specified
		}
	},

	/**
	* Gets or post a commit object.
	* The commit sha has to be passed in through the sha parameter.
	*
	* @options:
	* 	@user the user
	* 	@repo the repository
	* 	@sha sha of the commit object to retrieve/the parent commit object of the new commit object
	* 	@tree either the name of a tag or the sha of the tree to associate to the commit object.
	*	@message the commit message
	* 	@ref the reference to the commit object to retrieve/update
	* @returns a deferred for the call; callback will yield a commit object
	*/
	commitTree: function( options ) {
		if ( options.tree ) {
			var dr = $.Deferred();

			// POST a commit object and update the reference to it
			post( api + "/repos/" + options.user + "/" + options.repo + "/git/commits", {
				message: options.message,
				tree: options.tree,
				parents: [options.sha]
			} ).done( function( new_commit ) {
					$( this ).github( 'ref', {
						user: options.user,
						repo: options.repo,
						ref: options.ref,
						sha: new_commit.sha
					} ).done( drdf( dr ) ).fail( drff( dr ) );
				} );

			return dr.promise();
		} else {
			// GET a commit object
			return get( api + "/repos/" + options.user + "/" + options.repo + "/commits/" + options.sha );
		}
	}
  }

  $.fn.github = function( method ) {
    if ( methods[method] ) {
      return methods[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
    } else if ( typeof method === 'object' || ! method ) {
      return methods.init.apply( this, arguments );
    } else {
      $.error( 'Method ' +  method + ' does not exist on jQuery.github' );
    }
  };

  function cleanPath( path ) {
	if ( path ) {
		// clean the path
		path = path.trim();
		if ( path[0] == '/' ) {
			path = path.substring( 1, path.length );
		}
	}
	return path;
  }

  /**
   * Read a page's GET URL variables and return them as an associative array.
   */
  function getUrlVars()
  {
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
  }

  function get( url, data ) {
  	return ajaxCall( 'GET', url, data );
  }

  function post( url, data ) {
  	return ajaxCall ( 'POST', url, JSON.stringify(data, null, 2) );
  }

  function ajaxCall( type, url, data ) {
  	var dr = $.Deferred();

  	var headers = {};
  	addAuthData( headers );

	jQuery.ajax({
		url: url,
		type: type,
		data: data,
		dataType: "json",
		headers: headers,
		cache: false
	}).done( drdf( dr ) ).fail( drfa( dr ) );

	return dr.promise();
  }

  function addAuthData( headers ) {
  	if ( auth ) {
  		if ( auth.type == 'basic' ) {
  			headers.Authorization = "Basic " + auth.encodedCredentials;
  		} else if ( auth.type == 'oauth' ) {
  			headers.Authorization = "token " + auth.access_token;
  		}
  	}
  }


  /**
   * Generic progress to be forwarded to the given deferred
   */
  function drp( deferred, progressObject ) {
  	deferred.notifyWith( this, [progressObject] );
  }

  /**
   * Generic success to be forwarded to the given deferred
   */
  function drd( deferred, doneObject ) {
  	deferred.resolveWith( this, [doneObject] );
  }

  /**
   * Builds a deferred callback for success cases on the given deferred
   */
  function drdf( deferred ) {
  	return function( doneObject ) { deferred.resolveWith( this, [doneObject] ); };
  }

  /**
   * Generic failure to be forwarded to the given deferred
   */
  function drf( deferred, error_key, details ) {
  	deferred.rejectWith( this, [ {
  		code: error_codes[error_key][0],
  		message: error_codes[error_key][1],
  		details: details
  	} ] );
  }

  /**
   * Builds a deferred callback for failure cases on the given deferred
   */
  function drff( deferred ) {
  	return function( error ) { deferred.rejectWith( this, [error] ); };
  }

  /**
   * Builds a deferred callback for ajax failures
   */
  function drfa( deferred ) {
	return function( xhr, textStatus, errorThrown ) {
		deferred.rejectWith( this, [ {
			code: error_codes.AJAX_REQUEST_FAILED[0],
			message: textStatus, // report specific message
			details: {
				xhr: xhr,
				errorThrown: errorThrown
			}
		} ] );
	};
  }

  function checkAuth( deferred ) {
  	var authValid = false;
  	if ( auth ) {
  		if ( auth.type == "basic" && auth.encodedCredentials ) {
  			authValid = true;
  		} else if ( auth.type == "oauth" && auth.access_token ) {
  			authValid = true;
  		}
  	}

	if ( !authValid ) {
		drf( deferred, "NEEDS_AUTHENTICATION" );
	}

	return authValid;
  }
})( jQuery );
