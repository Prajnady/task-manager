const express = require('express');
const app = express();

const { mongoose } = require('./db/mongoose');

const bodyParser = require('body-parser');
//Loa in the mongoose models
const { List } = require('./db/models/list.model');
const { Task } = require('./db/models/task.model');
const { User } = require('./db/models/user.model');

const jwt = require('jsonwebtoken');


//load middleware
app.use(bodyParser.json());

//CORS HEADER MIDDLEWARE
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS,PUT, PATCH, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");
  
   res.header(
        'Access-Control-Expose-Headers',
        'x-access-token, x-refresh-token'
    );


  next();
});

// check whether the request has a valid JWT access token
let authenticate = (req, res, next) => {
	let token = req.header('x-access-token');

	//verify the JWT
	jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
		if (err) {
			//there was an error
			//jwt is invalid- * DO NOT AUTHENTICATE
			res.status(401).send(err);
		} else {
			//JWT is valid
			req.user_id = decoded._id;
			next();
		}
	});
}


//verify Refresh Token Middleware 
let verifySession = (req, res, next) => {
	let refreshToken = req.header('x-refresh-token');

	let _id = req.header('_id');

	User.findByIdAndToken(_id, refreshToken).then((user) => {
		if(!user) {
			//user couldn't be found
			return Promise.reject({
				'error': 'User not found. Make sure that the refresh token and user id are correct'		
			});
		}

		//if the code reaches here - the user was found
		//therefore the session is valid

		req.user_id = user._id;
		req.userObject = user;
		req.refreshToken = refreshToken;

		let isSessionValid = false;

		user.sessions.forEach((session) => {
			if (session.token === refreshToken) {
				//check if the session has expired
				if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
					//refresh token has not expired
					isSessionValid = true;
				}
			}
		});

		if (isSessionValid) {
			next();
		}
		else {
			return Promise.reject({
				'error': 'Refresh token has expired or the session is invalid'
			})
		}

		}).catch((e) => {
			res.status(401).send(e);
		})
}


/* ROUTE HANDLERS*/

/* LIST ROUTES*/

/*
*GEt/lists
*Purpose: Get all lists
*/

app.get('/lists', authenticate, (req,res) => {
	//we want to return an array of all the lists that belong to the authenticates user
	List.find({
		_userId: req.user_id
	}).then((lists) => {
		res.send(lists);
	}).catch((e) => {
		res.send(e);
	});
})

/*
*POST/lists
*Purpose: create a list
*/

app.post('/lists', authenticate, (req,res) => {
//we want to create a new list and return the new list document back to the user
// the list information (fields) will be passed in via the Json request body
	let title = req.body.title;

	let newList = new List({
		title,
		_userId: req.user_id
	});
	newList.save().then((listDoc) => {
		//the full list document is returned (incl. id)
		res.send(listDoc);
	})
});

/*8
* PATH/lists/:id
*purpose:update a specified list
*/
app.patch('/lists/:id', authenticate, (req,res) => {
	// we want to update the specified list(list document with id in the url) with the new values specified in the JSON body of the request
	List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
		$set: req.body
	}).then(() => {
		res.send({ 'message': 'updated successfully' });
	});
});


/*DELETE/lists/:id
*Purpose:Delete a list

*/
app.delete('/lists/:id', authenticate, (req, res) => {
//we want to delete the specified list (documnet with the id in the URL)
	List.findOneAndRemove({ 
		_id: req.params.id,
		_userId: req.user_id
	}).then((removedListDoc) => {
		res.send(removedListDoc);

		//delete all the tasks that are in the deleted list
deleteTasksFromList(removedListDoc._id);

	})
});
	
/**
*GET/lists/:listId/tasks
*Purpose:Get all tasks in a specific lists
*/
app.get('/lists/:listId/tasks', authenticate, (req,res) => {
	//we want to return all tasks that belong to specific list
	Task.find({
		_listId: req.params.listId
	}).then((tasks) => {
		res.send(tasks);
	})
});

// app.get('/lists/:listId/tasks/:taskId', (req,res) => {
// 	Task.findOne({
// 		_id: req.params.taskId,
// 		_listId: req.params.listId
// 	}).then((task) => {
// 		res.send(task);
// 	})
// });

app.post('/lists/:listId/tasks',authenticate, (req,res) => {
	//we want to create a new task in a list specified in a listId
	List.findOne({
		_id: req.params.listId,
		_userId: req.user_id
	}).then((list) => {
		if(list) {
			//list object is valid
			// therefore the currently authenticated user can create new tasks
			return true;
		}
		//else-the user object is undefined
		return false;
	}).then((canCreateTask) => {
		if(canCreateTask) {
			let newTask = new Task({
		title: req.body.title,
		_listId: req.params.listId
	});
	newTask.save().then((newTaskDoc) => {
		res.send(newTaskDoc);
	})
	} else {
		res.sendStatus(404);
	}

	})

	
})

/*
*PATCH/lists/:listId/tasks/:taskId
*/
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req,res) =>{
// we want to update an existing task

	List.findOne({
		_id: req.params.listId,
		_userId: req.user_id
	}).then((list) => {
		if(list) {
			return true;
		}
		return false;
	}).then((canUpdateTasks) => {
		if (canUpdateTasks) {
			//the currently authenticated user can update tasks
			Task.findOneAndUpdate({
		_id: req.params.taskId,
		_listId: req.params.listId
	}, {
		$set: req.body
	}
	).then(() => {
		res.send({message: 'Updated successfully.'})
	})
		}
		else {
			res.sendStatus(404);

		}
	})

	
});

app.delete('/lists/:listId/tasks/:taskId',authenticate, (req,res) => {

	List.findOne({
		_id: req.params.listId,
		_userId: req.user_id
	}).then((list) => {
		if(list) {
			return true;
		}
		return false;
	}).then((canDeleteTasks) => {

		if (canDeleteTasks) {
			Task.findOneAndRemove({
		_id: req.params.taskId,
		_listId: req.params.listId
		// _taskId: req.params.taskId
	}).then((removedTaskDoc) => {
		res.send(removedTaskDoc);
	})
		} else {
			res.sendStatus(404);
		}
	});
	
});


/* USER ROUTES*/

/**
*post/ users
*Purpose: Sign up
*/

app.post('/users',(req,res) => {
	//user sign up
	let body = req.body;
	let newUser = new User(body);

	newUser.save().then(() => {
		return newUser.createSession();
	}).then((refreshToken) => {
		//session created successfully - refreshToken returned
		// now we generate an access auth token for the user

		 return newUser.generateAccessAuthToken().then((accessToken) => {
		 	//access auth token generated successfully,now we return an object containig the auth tokens
		 	return {accessToken, refreshToken}
		 });
	}).then((authTokens) => {
		res
			.header('x-refresh-token', authTokens.refreshToken)
			.header('x-access-token', authTokens.accessToken)
			.send(newUser);
	}).catch((e) => {
		res.status(400).send(e);
	})
})



/*
*POST/users/login
*Purpose: Login
*/

app.post('/users/login', (req, res) => {
	let email = req.body.email;
	let password = req.body.password;

	User.findByCredentials(email, password).then((user) => {
		return user.createSession().then((refreshToken) => {

			return user.generateAccessAuthToken().then((accessToken) => {
				return { accessToken, refreshToken}
			});
		}).then((authTokens) => {
			res
			.header('x-refresh-token', authTokens.refreshToken)
			.header('x-access-token', authTokens.accessToken)
			.send(user);
		})
	}).catch((e) => {
		res.status(400).send(e);
	});
})


/**
* GET /users/me/access-token
*purpose: generates and returns an access token
*/
app.get('/users/me/access-token', verifySession, (req,res) => {
//we know that the user/caller is authenticated and we have the user_id and user object available to us
	req.userObject.generateAccessAuthToken().then((accessToken) => {
		res.header('x-access-token',accessToken).send({ accessToken });
	}).catch((e) => {
		res.status(400).send(e);
	});
})


/*HELPER METHOD*/
let deleteTasksFromList = (_listId) => {
	Task.deleteMany({
		_listId
	}).then(() => {
		console.log("tasks from "+_listId + "were deleted!");
	})
}


app.listen(3000, () => {
	console.log("server is listening on post 3000");
})