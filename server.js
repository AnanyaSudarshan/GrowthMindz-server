// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const pool = require('./db');
// Middleware to parse JSON
app.use(express.json());
app.use(cors());
// Import routes
// Example signup route
app.post("/api/signup", async (req, res) => {
  try {
    const { firstname, lastname, email, password, confirm_password } = req.body;
    const result = await pool.query('INSERT INTO users (first_name, last_name, email, password, confirm_password) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email', [firstname, lastname, email, password, confirm_password]);
    const newUser = result.rows[0];
    res.json({ message: "Signup successful!", user: { id: newUser.id, first_name: newUser.first_name, last_name: newUser.last_name, email: newUser.email } });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Example login route
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt for email:", email);

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.rows[0];

    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({ message: "Login successful", user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone_number, date_of_birth: user.dob, bio: user.bio } });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//edit user profile
app.put("/api/edit-profile", async (req, res) => {
  try {
    const { id, firstname, lastname, email, phone_number, dob, bio } = req.body;
    const result = await pool.query('UPDATE users SET first_name = $1, last_name = $2, email = $3, phone_number = $4, dob=$5, bio=$6 WHERE id = $7', [firstname, lastname, email, phone_number, dob, bio, id]);
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//delete user profile
app.delete("/api/delete-profile", async (req, res) => {
  try {
    const { id } = req.body;
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: "Profile deleted successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//change password
app.put("/api/change-password", async (req, res) => {
  try {
    const { id, currentPassword, newPassword } = req.body;

    // First verify the current password
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];

    if (user.password !== currentPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Update the password
    const result = await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, id]);
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//get all users
app.get("/api/get-all-users", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// --- GET COURSES WITH VIDEO AND CATEGORY FILTER ---
app.get('/api/courses', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM courses';
    const params = [];
    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- GET COURSE VIDEOS JOINED WITH COURSES ---
app.get('/api/course-videos', async (req, res) => {
  try {
    // Select from courses_vedio directly; it already stores course_title
    const sql = `
      SELECT 
        v.course_title AS course_title,
        v.course_vedio_title AS course_vedio_title,
        v.vedio_url AS vedio_url
      FROM courses_vedio v
      ORDER BY v.cid, v.id
    `;
    const result = await pool.query(sql);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- QUIZ TABLES AND SUBMISSION ENDPOINT ---
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_submissions (
        submission_id SERIAL PRIMARY KEY,
        user_id INTEGER,
        qid INTEGER NOT NULL,
        score INTEGER NOT NULL,
        submitted_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_answers (
        answer_id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES quiz_submissions(submission_id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL,
        selected_answers CHAR(1) NOT NULL,
        is_correct BOOLEAN NOT NULL
      );
    `);
    // Ensure quizes has rows for all qids found in quiz_content (to satisfy FK on quiz_submissions.qid)
    await pool.query(`
      INSERT INTO quizes (qid, quiz_title)
      SELECT DISTINCT qc.qid, ('Chapter-' || qc.qid || ' quiz')
      FROM quiz_content qc
      LEFT JOIN quizes qz ON qz.qid = qc.qid
      WHERE qz.qid IS NULL;
    `);
    console.log('✅ Quiz tables ensured');
  } catch (e) {
    console.error('Failed ensuring quiz tables', e);
  }
})();

// --- GET QUIZ QUESTIONS ENDPOINT ---
app.get('/api/quiz/questions', async (req, res) => {
  try {
    const { qid } = req.query;
    const qidNum = Number.isFinite(parseInt(qid, 10)) ? parseInt(qid, 10) : 2; // default to 2

    const rowsRes = await pool.query(
      `SELECT qc.question_id,
              qc.qid,
              qc.question,
              qc.option_a,
              qc.option_b,
              qc.option_c,
              qc.option_d,
              qc.correct_answer,
              qz.quiz_title
       FROM quiz_content qc
       LEFT JOIN quizes qz ON qz.qid = qc.qid
       WHERE qc.qid = $1
       ORDER BY qc.question_id;`,
      [qidNum]
    );

    let rows = rowsRes.rows;
    if (rows.length === 0) {
      // Fallback: find the smallest available qid in quiz_content and load its questions
      const anyQidRes = await pool.query(
        `SELECT MIN(qid) AS qid FROM quiz_content;`
      );
      const fallbackQid = anyQidRes.rows[0]?.qid;
      if (!fallbackQid) {
        return res.status(404).json({ message: 'Quiz not found' });
      }
      const fallbackRowsRes = await pool.query(
        `SELECT qc.question_id,
                qc.qid,
                qc.question,
                qc.option_a,
                qc.option_b,
                qc.option_c,
                qc.option_d,
                qc.correct_answer,
                qz.quiz_title
         FROM quiz_content qc
         LEFT JOIN quizes qz ON qz.qid = qc.qid
         WHERE qc.qid = $1
         ORDER BY qc.question_id;`,
        [fallbackQid]
      );
      rows = fallbackRowsRes.rows;
    }

    const mapLetterToIndex = { A: 0, B: 1, C: 2, D: 3 };
    const questions = rows.map(r => {
      const options = [r.option_a, r.option_b, r.option_c, r.option_d].filter(Boolean);
      const letter = String(r.correct_answer || '').trim().toUpperCase();
      const idx = mapLetterToIndex[letter] ?? 0;
      const answer = options[idx] || '';
      return {
        id: r.question_id,
        questionId: r.question_id,
        question: r.question,
        options,
        answer,
        quiz_title: r.quiz_title || null
      };
    });

    res.json(questions);
  } catch (e) {
    console.error('Error fetching quiz questions:', e);
    res.status(500).json({ message: 'Internal server error', error: e.message });
  }
});

app.get('/api/quiz-content', async (req, res) => {
  try {
    const { qid } = req.query;
    const qidNum = parseInt(qid, 10);
    if (!Number.isInteger(qidNum)) {
      return res.status(400).json({ message: 'qid query param is required and must be an integer' });
    }

    const questionsResult = await pool.query(
      `SELECT question_id, qid, question, option_a, option_b, option_c, option_d, correct_answer
       FROM quiz_content
       WHERE qid = $1
       ORDER BY question_id;`,
      [qidNum]
    );

    const titleResult = await pool.query(
      'SELECT quiz_title FROM quizes WHERE qid = $1 LIMIT 1;',
      [qidNum]
    );

    res.json({
      qid: qidNum,
      quiz_title: (titleResult.rows[0] && titleResult.rows[0].quiz_title) || null,
      questions: questionsResult.rows
    });
  } catch (e) {
    console.error('Error fetching quiz_content by qid:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});
// API endpoint to save quiz answers
app.post('/api/quiz-answers', async (req, res) => {
  try {
    let { submission_id, question_id, selected_answers, is_correct } = req.body || {};

    // Basic validation and normalization
    const submissionIdNum = parseInt(submission_id, 10);
    const questionIdNum = parseInt(question_id, 10);
    const sel = (typeof selected_answers === 'string' && selected_answers.length > 0)
      ? selected_answers.trim().toUpperCase()[0]
      : 'N'; // Single char required by DB (A/B/C/D or N for not answered)
    const isCorrectBool = Boolean(is_correct);

    if (!Number.isInteger(submissionIdNum) || !Number.isInteger(questionIdNum)) {
      return res.status(400).json({ success: false, error: 'submission_id and question_id must be integers' });
    }

    // Optional: ensure selected char is valid
    const validChars = new Set(['A','B','C','D','N']);
    const selectedChar = validChars.has(sel) ? sel : 'N';

    const result = await pool.query(
      `INSERT INTO quiz_answers (submission_id, question_id, selected_answers, is_correct)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [submissionIdNum, questionIdNum, selectedChar, isCorrectBool]
    );

    res.json({ success: true, answer: result.rows[0] });
  } catch (err) {
    console.error('quiz-answers insert error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint
    });
    res.status(500).json({ success: false, error: err.message, detail: err.detail || null });
  }
});

// Quick verification endpoint: fetch latest submission with its answers
app.get('/api/quiz/submissions/latest', async (req, res) => {
  try {
    const latest = await pool.query(
      `SELECT submission_id, user_id, qid, submitted_at, score
       FROM quiz_submissions
       ORDER BY submitted_at DESC
       LIMIT 1;`
    );
    if (latest.rows.length === 0) {
      return res.json({ ok: true, submission: null, answers: [] });
    }
    const submission = latest.rows[0];
    const answers = await pool.query(
      `SELECT qa.answer_id,
              qa.submission_id,
              qa.question_id,
              qa.selected_answers,
              qa.is_correct,
              qc.question
       FROM quiz_answers qa
       LEFT JOIN quiz_content qc ON qc.question_id = qa.question_id
       WHERE qa.submission_id = $1
       ORDER BY qa.answer_id;`,
      [submission.submission_id]
    );
    res.json({ ok: true, submission, answers: answers.rows });
  } catch (err) {
    console.error('latest submission fetch error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- QUIZ SUBMISSION ENDPOINT ---
app.post('/api/quiz/submit', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { answers, questions, userId } = req.body || {};
    
    // Validate input
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ message: 'Invalid answers format' });
    }
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ message: 'Invalid questions format' });
    }
    
    // Calculate score and results
    let correctCount = 0;
    let attemptedCount = 0;
    const answerDetails = [];
    
    // Process all questions - store answers for ALL questions (answered and unanswered)
    questions.forEach(q => {
      const userAnswer = answers[q.id];
      let isCorrect = false;
      let selectedAnswer = 'N'; // Default to 'N' for not answered (char type requires single character)
      
      // Get quiz_content.question_id (use questionId if available, otherwise fallback to id)
      const questionContentId = q.questionId || q.id;
      
      if (userAnswer) {
        attemptedCount++;
        isCorrect = userAnswer === q.answer;
        if (isCorrect) {
          correctCount++;
        }
        
        // Find the option index for selected_answers (A, B, C, D)
        const optionIndex = q.options.findIndex(opt => opt === userAnswer);
        selectedAnswer = optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : 'N'; // A, B, C, D or N
      }
      
      // Store answer details for ALL questions
      answerDetails.push({
        questionId: questionContentId, // Use quiz_content.question_id for foreign key
        selectedAnswer: selectedAnswer, // Single character: A, B, C, D, or N
        isCorrect: isCorrect
      });
    });
    
    const totalQuestions = questions.length;
    const score = correctCount;
    
    // Determine a valid qid to satisfy FK to quizes
    const requestedQid = Number.isFinite(parseInt(req.body?.qid, 10)) ? parseInt(req.body.qid, 10) : 2;
    let quizQid = requestedQid;
    // Check if requestedQid exists in quizes
    const qidCheck = await client.query('SELECT qid FROM quizes WHERE qid = $1', [requestedQid]);
    if (qidCheck.rows.length === 0) {
      // Fallback to first available qid in quizes
      const anyQid = await client.query('SELECT qid FROM quizes ORDER BY qid LIMIT 1');
      if (anyQid.rows.length > 0) {
        quizQid = anyQid.rows[0].qid;
      } else {
        // As a last resort, create a stub quiz row to satisfy FK
        try {
          await client.query('INSERT INTO quizes (qid, quiz_title) VALUES ($1, $2)', [requestedQid, 'Chapter-1 quiz']);
          quizQid = requestedQid;
        } catch (stubErr) {
          console.error('Failed to create stub quiz in quizes:', stubErr.message);
          throw stubErr;
        }
      }
    }
    
    // Insert into quiz_submissions
    const submissionResult = await client.query(
      `INSERT INTO quiz_submissions (user_id, qid, score, submitted_at) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING submission_id;`,
      [userId || null, quizQid, score]
    );
    
    const submissionId = submissionResult.rows[0].submission_id;
    
    // Insert ALL answers into quiz_answers table (including unanswered questions)
    console.log(`Inserting ${answerDetails.length} answers for submission_id: ${submissionId}`);
    for (const answer of answerDetails) {
      try {
        await client.query(
          `INSERT INTO quiz_answers (submission_id, question_id, selected_answers, is_correct) 
           VALUES ($1, $2, $3, $4);`,
          [submissionId, answer.questionId, answer.selectedAnswer, answer.isCorrect]
        );
        console.log(`  ✅ Inserted answer: question_id=${answer.questionId}, selected='${answer.selectedAnswer}', correct=${answer.isCorrect}`);
      } catch (insertError) {
        console.error(`  ❌ Failed to insert answer for question_id ${answer.questionId}:`, insertError.message);
        throw insertError; // Re-throw to trigger transaction rollback
      }
    }
    
    console.log(`✅ Successfully stored ${answerDetails.length} answers in quiz_answers table for submission_id: ${submissionId}`);
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Quiz submitted successfully',
      submissionId: submissionId,
      results: {
        total: totalQuestions,
        attempted: attemptedCount,
        correct: correctCount,
        score: score
      },
      details: answerDetails.map(a => ({
        questionId: a.questionId,
        isCorrect: a.isCorrect,
        selectedAnswer: a.selectedAnswer
      }))
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Quiz submission error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Internal server error', 
      error: error.message,
      detail: error.detail || null
    });
  } finally {
    client.release();
  }
});

// Legacy endpoint (keeping for backward compatibility)
app.post('/api/quizzes/nism/ch1/submit', async (req, res) => {
  try {
    const { userId, quizId = 'nism_ch1', score, total, answers } = req.body || {};
    if (!Number.isInteger(score) || !Number.isInteger(total) || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const subResult = await pool.query(
      'INSERT INTO quiz_submissions (user_id, qid, score, submitted_at) VALUES ($1, $2, $3, NOW()) RETURNING submission_id',
      [userId || null, 2, score]
    );
    const submissionId = subResult.rows[0].submission_id;

    if (answers.length > 0) {
      for (const a of answers) {
        await pool.query(
          `INSERT INTO quiz_answers (submission_id, question_id, selected_answers, is_correct) 
           VALUES ($1, $2, $3, $4);`,
          [submissionId, a.questionId, String(a.selectedOption || ''), Boolean(a.isCorrect)]
        );
      }
    }

    res.json({ message: 'Submission saved', submissionId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(5000, () => console.log('✅ Backend running on port 5000'));
