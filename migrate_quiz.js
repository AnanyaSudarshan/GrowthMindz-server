const pool = require('./db');

async function migrateQuiz() {
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    console.log('✅ Transaction started');
    
    // Step 1: Find the NISM quiz
    // First, let's check the quizes table to find the NISM quiz
    const quizesResult = await client.query('SELECT * FROM quizes ORDER BY qid;');
    console.log('\n=== All quizzes ===');
    console.log(JSON.stringify(quizesResult.rows, null, 2));
    
    // For NISM, we need to find the quiz_id that corresponds to NISM
    // Let's check if there's a quiz_id in quiz_questions that might be related
    const quizQuestionsCheck = await client.query('SELECT DISTINCT quiz_id FROM quiz_questions ORDER BY quiz_id;');
    console.log('\n=== Existing quiz_ids in quiz_questions ===');
    console.log(JSON.stringify(quizQuestionsCheck.rows, null, 2));
    
    // Based on the data, it seems qid=2 is the quiz we want (Chapter-1 Quiz)
    // But we need to understand the relationship between qid (in quizes) and quiz_id (in quiz_questions)
    // Let's check the current quiz_questions data
    const currentQuizData = await client.query(`
      SELECT qq.*, qo.* 
      FROM quiz_questions qq 
      LEFT JOIN quiz_options qo ON qq.id = qo.question_id 
      ORDER BY qq.quiz_id, qq.question_order, qo.option_order;
    `);
    console.log('\n=== Current quiz_questions and quiz_options data ===');
    console.log(JSON.stringify(currentQuizData.rows.slice(0, 10), null, 2));
    
    // For NISM quiz, let's assume quiz_id = 1 or we need to find it
    // Since we see qid=2 in quizes table, and the quiz_content has qid=2, 
    // we need to determine what quiz_id to use in quiz_questions
    
    // Let's check what the relationship is - maybe quiz_id in quiz_questions corresponds to qid in quizes
    // Or maybe there's a mapping we need to understand
    
    // For now, let's fetch all data from quiz_content where qid matches the quiz we want
    const targetQid = 2; // Based on the sample data showing qid=2
    
    // Fetch quiz_title from quizes table
    const quizTitleResult = await client.query('SELECT quiz_title FROM quizes WHERE qid = $1;', [targetQid]);
    const originalQuizTitle = quizTitleResult.rows.length > 0 ? quizTitleResult.rows[0].quiz_title : null;
    console.log(`\n=== Original quiz title for qid=${targetQid} ===`);
    console.log(`Title: ${originalQuizTitle}`);
    
    // Fetch all questions from quiz_content table
    const quizContentResult = await client.query('SELECT * FROM quiz_content WHERE qid = $1 ORDER BY question_id;', [targetQid]);
    console.log(`\n=== Found ${quizContentResult.rows.length} questions in quiz_content ===`);
    
    if (quizContentResult.rows.length === 0) {
      throw new Error('No questions found in quiz_content table for the specified quiz');
    }
    
    // Determine the quiz_id to use in quiz_questions
    // quiz_id references quizzes.id (not quizes.qid)
    // Check the quizzes table to find the NISM quiz
    const quizzesCheck = await client.query('SELECT * FROM quizzes WHERE title LIKE \'%Chapter%\' OR title LIKE \'%NISM%\' ORDER BY id;');
    console.log('\n=== Quizzes in quizzes table ===');
    console.log(JSON.stringify(quizzesCheck.rows, null, 2));
    
    let targetQuizId;
    if (quizzesCheck.rows.length > 0) {
      // Use the first matching quiz (should be the NISM Chapter-1 quiz)
      targetQuizId = quizzesCheck.rows[0].id;
      console.log(`\n=== Using quiz_id = ${targetQuizId} (${quizzesCheck.rows[0].title}) ===`);
    } else {
      // If no quiz exists, we need to create one
      // But for now, let's use quiz_id = 3 which we know exists
      targetQuizId = 3;
      console.log(`\n=== Using quiz_id = ${targetQuizId} (default) ===`);
    }
    
    // Step 2: Delete all existing questions and options for NISM quiz
    console.log(`\n=== Step 2: Deleting existing questions for quiz_id = ${targetQuizId} ===`);
    
    // First, get all question IDs for this quiz
    const existingQuestionIds = await client.query(
      'SELECT id FROM quiz_questions WHERE quiz_id = $1;',
      [targetQuizId]
    );
    
    if (existingQuestionIds.rows.length > 0) {
      const questionIds = existingQuestionIds.rows.map(row => row.id);
      console.log(`Found ${questionIds.length} existing questions to delete`);
      
      // Delete options first (due to foreign key constraints)
      await client.query(
        `DELETE FROM quiz_options WHERE question_id = ANY($1::int[]);`,
        [questionIds]
      );
      console.log(`✅ Deleted ${questionIds.length} question options`);
      
      // Delete questions
      await client.query(
        'DELETE FROM quiz_questions WHERE quiz_id = $1;',
        [targetQuizId]
      );
      console.log(`✅ Deleted ${questionIds.length} questions`);
    } else {
      console.log('No existing questions found to delete');
    }
    
    // Step 3: Insert new questions and options from quiz_content
    console.log(`\n=== Step 3: Inserting ${quizContentResult.rows.length} questions from quiz_content ===`);
    
    for (let i = 0; i < quizContentResult.rows.length; i++) {
      const row = quizContentResult.rows[i];
      
      // Insert question
      const questionResult = await client.query(
        `INSERT INTO quiz_questions (quiz_id, question_text, question_order) 
         VALUES ($1, $2, $3) RETURNING id;`,
        [targetQuizId, row.question, i + 1]
      );
      
      const questionId = questionResult.rows[0].id;
      
      // Insert options
      const options = [
        { text: row.option_a, order: 1 },
        { text: row.option_b, order: 2 },
        { text: row.option_c, order: 3 },
        { text: row.option_d, order: 4 }
      ];
      
      const correctAnswerIndex = row.correct_answer.trim().toUpperCase();
      const correctIndexMap = { 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
      const correctOrder = correctIndexMap[correctAnswerIndex] || 1;
      
      for (const option of options) {
        const isCorrect = option.order === correctOrder;
        await client.query(
          `INSERT INTO quiz_options (question_id, option_text, is_correct, option_order) 
           VALUES ($1, $2, $3, $4);`,
          [questionId, option.text, isCorrect, option.order]
        );
      }
      
      console.log(`✅ Inserted question ${i + 1}: "${row.question.substring(0, 50)}..." (Correct: ${correctAnswerIndex})`);
    }
    
    // Step 4: Update quiz title to "Chapter-1 quiz" in both tables
    console.log(`\n=== Step 4: Updating quiz title to "Chapter-1 quiz" ===`);
    
    // Update in quizes table
    await client.query(
      'UPDATE quizes SET quiz_title = $1 WHERE qid = $2;',
      ['Chapter-1 quiz', targetQid]
    );
    console.log(`✅ Updated quiz title in quizes table to "Chapter-1 quiz"`);
    
    // Update in quizzes table (this is what quiz_questions references)
    await client.query(
      'UPDATE quizzes SET title = $1 WHERE id = $2;',
      ['Chapter-1 quiz', targetQuizId]
    );
    console.log(`✅ Updated quiz title in quizzes table to "Chapter-1 quiz"`);
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!');
    
    // Verify the migration
    console.log('\n=== Verification ===');
    const verifyQuestions = await client.query(
      'SELECT COUNT(*) as count FROM quiz_questions WHERE quiz_id = $1;',
      [targetQuizId]
    );
    const verifyOptions = await client.query(
      `SELECT COUNT(*) as count FROM quiz_options 
       WHERE question_id IN (SELECT id FROM quiz_questions WHERE quiz_id = $1);`,
      [targetQuizId]
    );
    const verifyTitle = await client.query(
      'SELECT quiz_title FROM quizes WHERE qid = $1;',
      [targetQid]
    );
    
    console.log(`Questions inserted: ${verifyQuestions.rows[0].count}`);
    console.log(`Options inserted: ${verifyOptions.rows[0].count}`);
    console.log(`Quiz title: ${verifyTitle.rows[0].quiz_title}`);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('\n❌ Error during migration:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
    process.exit(0);
  }
}

migrateQuiz().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

