const express = require("express");
const app = express();
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
app.use(express.json());
app.use(cors());

const dbPath = path.join(__dirname, "tracker.db");

let db = null;

const initializeServerAndDatabase = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    await db.run("PRAGMA foreign_keys = ON;");
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

const PORT = process.env.PORT || 5000;

initializeServerAndDatabase();

app.listen(PORT, () => {
  console.log("Server is Running at http://localhost:5000");
});

app.get("/", async (req, res) => {
  res.send("Backend is Running");
});

app.post("/signup", async (request, response) => {
  const { name, email, password, country } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userSelectQuery = `SELECT * FROM users WHERE email='${email}'`;
  const dbResponse = await db.get(userSelectQuery);
  if (dbResponse === undefined) {
    const insertQuery = `INSERT INTO users(name, email, password, country)
							VALUES('${name}', '${email}', '${hashedPassword}', '${country}')`;
    const dbResponse = await db.run(insertQuery);
    const selectQuery = `SELECT * FROM users WHERE email='${email}'`;
    const selectResponse = await db.get(selectQuery);
    const payload = {
      username: email,
      userId: selectResponse.id,
    };
    const jwtToken = jwt.sign(payload, "Vinay Sunkari");
    response.status(200);
    response.send({ jwtToken });
  } else {
    response.status(400);
    response.send({ error: "User already exists" });
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send({ error: "Your session has expired. Please log in again" });
  } else {
    jwt.verify(jwtToken, "Vinay Sunkari", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send({
          error: "Your session has expired. Please log in again",
        });
      } else {
        request.userId = payload.userId;
        next();
      }
    });
  }
};

app.post("/login", async (request, response) => {
  const { email, password } = request.body;
  const userQuery = `SELECT * FROM users WHERE email='${email}'`;
  const dbResponse = await db.get(userQuery);
  if (dbResponse === undefined) {
    response.status(400);
    response.send({ error: "Invalid User" });
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      dbResponse.password
    );
    const payload = {
      username: email,
      userId: dbResponse.id,
    };
    if (isPasswordMatched) {
      const jwtToken = jwt.sign(payload, "Vinay Sunkari");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send({ error: "Email or Password didn't matched" });
    }
  }
});

app.get("/projects", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getProjectsQuery = `SELECT * FROM projects where user_id=${userId}`;
  const dbResponse = await db.all(getProjectsQuery);
  console.log(dbResponse);
  response.send(dbResponse);
});

app.post("/projects", authenticateToken, async (request, response) => {
  const { userId } = request;
  const { projectName } = request.body;
  const insertQuery = `INSERT INTO projects(user_id, project_name) VALUES('${userId}', '${projectName}');`;
  const dbResponse = await db.run(insertQuery);
  response.status(200);
  response.send({ success: "Project Created Successfully" });
});

app.delete("/projects/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const { userId } = request;
  const deleteQuery = `DELETE FROM projects WHERE id='${id}' AND user_id='${userId}';`;
  const dbResponse = await db.run(deleteQuery);
  response.send({ success: "Project Successfully Deleted" });
});

app.get("/projects/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const { userId } = request;
  const getQuery = `SELECT ROW_NUMBER() OVER (ORDER BY id) AS serialId,* FROM tasks WHERE user_id = '${userId}' AND project_id='${id}';`;
  const dbResponse = await db.all(getQuery);
  response.send(dbResponse);
});

app.post(
  "/projects/:id/tasks",
  authenticateToken,
  async (request, response) => {
    const { id } = request.params;
    const { userId } = request;
    const { title, description, status } = request.body;
    const postQuery = `INSERT INTO tasks(user_id, project_id, title, description, status) VALUES('${userId}', '${id}', '${title}', '${description}', '${status}');`;
    const dbResponse = await db.run(postQuery);
    response.send({ success: "Task Created Successfully" });
  }
);

app.get(
  "/projects/:projectId/tasks/:taskId",
  authenticateToken,
  async (request, response) => {
    const { projectId, taskId } = request.params;
    const { userId } = request;
    const getTaskQuery = `SELECT * FROM tasks WHERE project_id='${projectId}' AND user_id='${userId}' AND id='${taskId}';`;
    const dbResponse = await db.all(getTaskQuery);
    response.send(dbResponse);
  }
);

app.put(
  "/projects/:projectId/tasks/:taskId",
  authenticateToken,
  async (request, response) => {
    const { projectId, taskId } = request.params;
    const { status } = request.body;
    const { userId } = request;
    let updateQuery;
    if (status !== "Done") {
      updateQuery = `UPDATE tasks SET status='${status}' WHERE project_id='${projectId}' AND id='${taskId}' AND user_id='${userId}';`;
    } else {
      updateQuery = `UPDATE tasks SET status='${status}', completed_at=CURRENT_TIMESTAMP WHERE project_id='${projectId}' AND id='${taskId}' AND user_id='${userId}';`;
    }
    const dbResponse = await db.run(updateQuery);
    response.send({ success: "Task Updated Successfully" });
  }
);

app.delete(
  "/projects/:projectId/tasks/:taskId",
  authenticateToken,
  async (request, response) => {
    const { projectId, taskId } = request.params;
    const { userId } = request;
    const deleteQuery = `DELETE FROM tasks WHERE project_id='${projectId}' AND id='${taskId}' AND user_id='${userId}';`;
    const dbResponse = await db.run(deleteQuery);
    response.send({ Success: "Task Deleted Successfully" });
  }
);
