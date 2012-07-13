(function($) {

  var api = "https://api.github.com";

  var access_token;

  var methods = {
	init: function( options ) {
	},

	authorizeURL: function( options ) {
		return "https://github.com/login/oauth/authorize?" +
			"client_id=" + options.client_id +
			"&scope=" + options.scope;
	},

	authorized: function() {
		return getUrlVars().access_token != undefined;
	},

	/**
	 * Given the temporary code and state from github, this method will get the access_token and
	 * store it for use in subsequent calls
	 *
	 * @options:
	 *	@client_id  The client ID received from GitHub when the application was registered.
	 *	@redirect_uri
	 *	@client_secret The client secret received from GitHub when the application was registered.
	 *	@code The code received as a response to auth phase
	 *	@state The state received as a response to auth phase
	 */
	accessToken: function( options ) {
		var dr = $.Deferred();
		var drd = function( access_token ) { dr.resolveWith( this, [access_token] ); };
		var drf = function() { dr.reject(); };

		post( 'https://github.com/login/oauth/access_token', options )
			.done( function( token ) {
				access_token = token;
				drd( access_token );
			} )
			.fail( drf );

		return dr.promise();
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
			// POST a new tree
			return post( api + "/repos/" + options.user + "/" + options.repo + "/git/trees", {
				base_tree: options.tree,
				tree: options.new_tree
			} );
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
		var drd = function( tree ) { dr.resolveWith( this, [tree] ); };
		var drf = function() { dr.reject(); };

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
						} ).done( drd ).fail( drf );
					} else {
						drf();
					}
				} else {
					// got it
					dr.resolveWith( this, [tree] );
				}
			} )
			.fail( drf );

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
		var drd = function( blob ) { dr.resolveWith( this, [blob] ); };
		var drf = function() { dr.reject(); };

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
				$( this ).github( 'blob', opt ).done( drd ).fail( drf );
			} )
			.fail( drf );

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
			// POST
			return post( api + "/repos/" + options.user + "/" + options.repo + "/git/refs/" + options.ref, {
				sha: options.sha
			} );
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
				// POST a commit object
				if ( !options.new_tree ) {
					return $( this ).github( 'commitTree', options );
				} else {
					// a new tree has to be created first
					var dr = $.Deferred();
					var drd = function( commit ) { dr.resolveWith( this, [commit] ); };
					var drf = function() { dr.reject(); };

					$( this ).github( 'tree', options )
						.done( function( tree ) {
							var opt = $.extend( {}, options );
							delete opt.new_tree;
							opt.tree = tree.sha;
							$( this ).github( 'commit', opt ).done( drd ).fail( drf );
						} )
						.fail( drf );

					return dr.promise();
				}
			} else {
				// GET a commit object
				return get( api + "/repos/" + options.user + "/" + options.repo + "/commits/" + options.sha );
			}
		} else if ( options.commit_ref  ) {
			// resolve commit sha first
			var dr = $.Deferred();
			var drd = function( commit ) { dr.resolveWith( this, [commit] ); };
			var drf = function() { dr.reject(); };

			var opt = $.extend( { ref: options.commit_ref }, options );
			delete opt.commit_ref;
			$( this ).github( 'ref', opt )
				.done( function( ref ) {
					if ( ref.object && ref.object.type == 'commit' ) {
						opt.sha = ref.object.sha;
						$( this ).github( 'commit', opt ).done( drd ).fail( drf );
					} else {
						// commit object not found
						drf();
					}
				} )
				.fail( drf );

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
			var drd = function( ref ) { dr.resolveWith( this, [ref] ); };
			var drf = function() { dr.reject(); };

			// POST a commit object and update the reference to it
			post( api + "/repos/" + options.user + "/" + options.repo + "/commits", {
				message: options.message,
				tree: options.tree,
				parents: [options.sha]
			} ).done( function( sha_new_commit ) {
					$( this ).github( 'ref', {
						user: options.user,
						repo: options.repo,
						ref: options.ref,
						sha: sha_new_commit
					} ).done( drd ).fail( drf );
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

  function get( url ) {
	return jQuery.ajax({
		url: url,
		type: 'GET',
		dataType: "json",
	});
  }

  function post( url, data ) {
	return jQuery.ajax({
		url: url,
		type: 'POST',
		data: data,
		dataType: "json",
	});
  }

})( jQuery );
