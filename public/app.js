/* ========================================
   NEON TODO - Application Logic
   ======================================== */

// Wait for Firebase to initialize
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure Firebase scripts are loaded
  setTimeout(initApp, 100);
});

function initApp() {
  // ========================================
  // Firebase References
  // ========================================
  const auth = firebase.auth();
  const db = firebase.firestore();
  
  // Set persistence to LOCAL (survives browser restarts)
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  
  // ========================================
  // DOM Elements
  // ========================================
  
  // Auth Elements
  const authContainer = document.getElementById('auth-container');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const showSignupBtn = document.getElementById('show-signup');
  const showLoginBtn = document.getElementById('show-login');
  const authError = document.getElementById('auth-error');
  
  // App Elements
  const appContainer = document.getElementById('app-container');
  const userEmailDisplay = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const todoList = document.getElementById('todo-list');
  const emptyState = document.getElementById('empty-state');
  const addTaskBtn = document.getElementById('add-task-btn');
  
  // Filters
  const filterStatus = document.getElementById('filter-status');
  const filterPriority = document.getElementById('filter-priority');
  const sortBy = document.getElementById('sort-by');
  
  // Task Modal
  const taskModal = document.getElementById('task-modal');
  const modalTitle = document.getElementById('modal-title');
  const taskForm = document.getElementById('task-form');
  const taskIdInput = document.getElementById('task-id');
  const taskTitleInput = document.getElementById('task-title');
  const taskDescriptionInput = document.getElementById('task-description');
  const taskPriorityInput = document.getElementById('task-priority');
  const taskCategoryInput = document.getElementById('task-category');
  const taskDueDateInput = document.getElementById('task-due-date');
  const cancelTaskBtn = document.getElementById('cancel-task');
  
  // Delete Modal
  const deleteModal = document.getElementById('delete-modal');
  const cancelDeleteBtn = document.getElementById('cancel-delete');
  const confirmDeleteBtn = document.getElementById('confirm-delete');
  
  // Loading
  const loading = document.getElementById('loading');
  
  // ========================================
  // State
  // ========================================
  let currentUser = null;
  let todos = [];
  let unsubscribeTodos = null;
  let taskToDelete = null;
  let draggedItem = null;
  
  // ========================================
  // Auth Functions
  // ========================================
  
  // Toggle between login and signup forms
  showSignupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
    authError.textContent = '';
  });
  
  showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.remove('active');
    loginForm.classList.add('active');
    authError.textContent = '';
  });
  
  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    showLoading(true);
    authError.textContent = '';
    
    try {
      await auth.signInWithEmailAndPassword(email, password);
      loginForm.reset();
    } catch (error) {
      authError.textContent = getErrorMessage(error.code);
    } finally {
      showLoading(false);
    }
  });
  
  // Signup
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    
    if (password !== confirm) {
      authError.textContent = 'Passwords do not match';
      return;
    }
    
    showLoading(true);
    authError.textContent = '';
    
    try {
      await auth.createUserWithEmailAndPassword(email, password);
      signupForm.reset();
    } catch (error) {
      authError.textContent = getErrorMessage(error.code);
    } finally {
      showLoading(false);
    }
  });
  
  // Logout
  logoutBtn.addEventListener('click', async () => {
    showLoading(true);
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      showLoading(false);
    }
  });
  
  // Auth state listener
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    
    if (user) {
      // User is signed in
      authContainer.classList.add('hidden');
      appContainer.classList.remove('hidden');
      userEmailDisplay.textContent = user.email;
      
      // Subscribe to todos
      subscribeTodos();
    } else {
      // User is signed out
      authContainer.classList.remove('hidden');
      appContainer.classList.add('hidden');
      
      // Unsubscribe from todos
      if (unsubscribeTodos) {
        unsubscribeTodos();
        unsubscribeTodos = null;
      }
      
      todos = [];
      renderTodos();
    }
  });
  
  // ========================================
  // Firestore Functions
  // ========================================
  
  function getTodosRef() {
    return db.collection('users').doc(currentUser.uid).collection('todos');
  }
  
  function subscribeTodos() {
    if (unsubscribeTodos) {
      unsubscribeTodos();
    }
    
    unsubscribeTodos = getTodosRef()
      .orderBy('order', 'asc')
      .onSnapshot((snapshot) => {
        todos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        renderTodos();
      }, (error) => {
        console.error('Error fetching todos:', error);
      });
  }
  
  async function addTodo(todoData) {
    showLoading(true);
    try {
      const maxOrder = todos.length > 0 
        ? Math.max(...todos.map(t => t.order || 0)) + 1 
        : 0;
      
      await getTodosRef().add({
        ...todoData,
        completed: false,
        order: maxOrder,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding todo:', error);
      alert('Failed to add task. Please try again.');
    } finally {
      showLoading(false);
    }
  }
  
  async function updateTodo(id, updates) {
    showLoading(true);
    try {
      await getTodosRef().doc(id).update(updates);
    } catch (error) {
      console.error('Error updating todo:', error);
      alert('Failed to update task. Please try again.');
    } finally {
      showLoading(false);
    }
  }
  
  async function deleteTodo(id) {
    showLoading(true);
    try {
      await getTodosRef().doc(id).delete();
    } catch (error) {
      console.error('Error deleting todo:', error);
      alert('Failed to delete task. Please try again.');
    } finally {
      showLoading(false);
    }
  }
  
  async function updateTodoOrder(reorderedTodos) {
    const batch = db.batch();
    
    reorderedTodos.forEach((todo, index) => {
      const ref = getTodosRef().doc(todo.id);
      batch.update(ref, { order: index });
    });
    
    try {
      await batch.commit();
    } catch (error) {
      console.error('Error updating order:', error);
    }
  }
  
  // ========================================
  // Render Functions
  // ========================================
  
  function renderTodos() {
    let filteredTodos = [...todos];
    
    // Apply status filter
    const statusFilter = filterStatus.value;
    if (statusFilter === 'active') {
      filteredTodos = filteredTodos.filter(t => !t.completed);
    } else if (statusFilter === 'completed') {
      filteredTodos = filteredTodos.filter(t => t.completed);
    }
    
    // Apply priority filter
    const priorityFilter = filterPriority.value;
    if (priorityFilter !== 'all') {
      filteredTodos = filteredTodos.filter(t => t.priority === priorityFilter);
    }
    
    // Apply sorting
    const sort = sortBy.value;
    if (sort === 'dueDate') {
      filteredTodos.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    } else if (sort === 'priority') {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      filteredTodos.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    } else if (sort === 'createdAt') {
      filteredTodos.sort((a, b) => {
        const aTime = a.createdAt?.toMillis() || 0;
        const bTime = b.createdAt?.toMillis() || 0;
        return bTime - aTime;
      });
    }
    // Default 'order' sorting is already applied from Firestore
    
    // Show/hide empty state
    if (filteredTodos.length === 0) {
      emptyState.classList.remove('hidden');
      todoList.innerHTML = '';
    } else {
      emptyState.classList.add('hidden');
      todoList.innerHTML = filteredTodos.map(todo => createTodoHTML(todo)).join('');
      
      // Add event listeners
      attachTodoEventListeners();
    }
  }
  
  function createTodoHTML(todo) {
    const dueDateClass = getDueDateClass(todo.dueDate, todo.completed);
    const formattedDate = todo.dueDate ? formatDate(todo.dueDate) : '';
    
    return `
      <div class="todo-item priority-${todo.priority} ${todo.completed ? 'completed' : ''}" 
           data-id="${todo.id}" draggable="true">
        <div class="todo-checkbox ${todo.completed ? 'checked' : ''}" data-action="toggle"></div>
        <div class="todo-content">
          <div class="todo-title">${escapeHtml(todo.title)}</div>
          ${todo.description ? `<div class="todo-description">${escapeHtml(todo.description)}</div>` : ''}
          <div class="todo-meta">
            ${formattedDate ? `<span class="todo-due-date ${dueDateClass}">📅 ${formattedDate}</span>` : ''}
            ${todo.category ? `<span class="todo-category">${escapeHtml(todo.category)}</span>` : ''}
          </div>
        </div>
        <span class="todo-priority ${todo.priority}">${todo.priority}</span>
        <div class="todo-actions">
          <button class="todo-action-btn" data-action="edit" title="Edit">✏️</button>
          <button class="todo-action-btn delete" data-action="delete" title="Delete">🗑️</button>
          <span class="drag-handle" title="Drag to reorder">≡</span>
        </div>
      </div>
    `;
  }
  
  function attachTodoEventListeners() {
    const todoItems = todoList.querySelectorAll('.todo-item');
    
    todoItems.forEach(item => {
      const id = item.dataset.id;
      
      // Toggle completion
      item.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
        const todo = todos.find(t => t.id === id);
        if (todo) {
          // Trigger confetti if marking as completed
          if (!todo.completed) {
            const rect = item.getBoundingClientRect();
            createConfetti(rect.left + 50, rect.top + rect.height / 2);
          }
          updateTodo(id, { completed: !todo.completed });
        }
      });
      
      // Edit
      item.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openEditModal(id);
      });
      
      // Delete
      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        taskToDelete = id;
        deleteModal.classList.remove('hidden');
      });
      
      // Drag and drop
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('drop', handleDrop);
      item.addEventListener('dragleave', handleDragLeave);
    });
  }
  
  // ========================================
  // Drag and Drop
  // ========================================
  
  function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
  }
  
  function handleDragEnd() {
    this.classList.remove('dragging');
    draggedItem = null;
    
    // Remove drag-over class from all items
    todoList.querySelectorAll('.todo-item').forEach(item => {
      item.classList.remove('drag-over');
    });
  }
  
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (this !== draggedItem) {
      this.classList.add('drag-over');
    }
  }
  
  function handleDragLeave() {
    this.classList.remove('drag-over');
  }
  
  function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    if (draggedItem && this !== draggedItem) {
      const draggedId = draggedItem.dataset.id;
      const targetId = this.dataset.id;
      
      // Find indices
      const draggedIndex = todos.findIndex(t => t.id === draggedId);
      const targetIndex = todos.findIndex(t => t.id === targetId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        // Reorder array
        const [removed] = todos.splice(draggedIndex, 1);
        todos.splice(targetIndex, 0, removed);
        
        // Update order in Firestore
        updateTodoOrder(todos);
        
        // Re-render
        renderTodos();
      }
    }
  }
  
  // ========================================
  // Modal Functions
  // ========================================
  
  // Add Task
  addTaskBtn.addEventListener('click', () => {
    modalTitle.textContent = 'Add New Task';
    taskForm.reset();
    taskIdInput.value = '';
    taskPriorityInput.value = 'medium';
    taskModal.classList.remove('hidden');
    taskTitleInput.focus();
  });
  
  // Edit Task
  function openEditModal(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    modalTitle.textContent = 'Edit Task';
    taskIdInput.value = id;
    taskTitleInput.value = todo.title;
    taskDescriptionInput.value = todo.description || '';
    taskPriorityInput.value = todo.priority;
    taskCategoryInput.value = todo.category || '';
    taskDueDateInput.value = todo.dueDate || '';
    taskModal.classList.remove('hidden');
    taskTitleInput.focus();
  }
  
  // Save Task
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const todoData = {
      title: taskTitleInput.value.trim(),
      description: taskDescriptionInput.value.trim(),
      priority: taskPriorityInput.value,
      category: taskCategoryInput.value.trim(),
      dueDate: taskDueDateInput.value || null
    };
    
    const id = taskIdInput.value;
    
    if (id) {
      // Update existing
      await updateTodo(id, todoData);
    } else {
      // Add new
      await addTodo(todoData);
    }
    
    closeTaskModal();
  });
  
  // Cancel Task
  cancelTaskBtn.addEventListener('click', closeTaskModal);
  
  function closeTaskModal() {
    taskModal.classList.add('hidden');
    taskForm.reset();
  }
  
  // Delete Confirmation
  cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    taskToDelete = null;
  });
  
  confirmDeleteBtn.addEventListener('click', async () => {
    if (taskToDelete) {
      await deleteTodo(taskToDelete);
      taskToDelete = null;
    }
    deleteModal.classList.add('hidden');
  });
  
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      taskModal.classList.add('hidden');
      deleteModal.classList.add('hidden');
      taskToDelete = null;
    });
  });
  
  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      taskModal.classList.add('hidden');
      deleteModal.classList.add('hidden');
      taskToDelete = null;
    }
  });
  
  // ========================================
  // Filter Event Listeners
  // ========================================
  
  filterStatus.addEventListener('change', renderTodos);
  filterPriority.addEventListener('change', renderTodos);
  sortBy.addEventListener('change', renderTodos);
  
  // ========================================
  // Utility Functions
  // ========================================
  
  function showLoading(show) {
    if (show) {
      loading.classList.remove('hidden');
    } else {
      loading.classList.add('hidden');
    }
  }
  
  function getErrorMessage(code) {
    const messages = {
      'auth/email-already-in-use': 'Email is already registered',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/too-many-requests': 'Too many attempts. Please try again later',
      'auth/invalid-credential': 'Invalid email or password'
    };
    return messages[code] || 'An error occurred. Please try again.';
  }
  
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }
  
  function getDueDateClass(dateString, completed) {
    if (!dateString || completed) return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dueDate = new Date(dateString);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 2) return 'due-soon';
    return '';
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // ========================================
  // Confetti Celebration
  // ========================================
  
  function createConfetti(x, y) {
    const colors = [
      '#39FF14', // neon green
      '#00F5FF', // neon blue
      '#FF10F0', // neon pink
      '#FF3131', // neon red
      '#FF6B00', // neon orange
      '#FFD700', // gold
    ];
    
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    
    // Create 60 confetti pieces
    for (let i = 0; i < 60; i++) {
      const confetti = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      // Random shape
      const shapeType = Math.random();
      let width, height, borderRadius;
      if (shapeType < 0.33) {
        width = 10; height = 10; borderRadius = '50%';
      } else if (shapeType < 0.66) {
        width = 8; height = 8; borderRadius = '2px';
      } else {
        width = 4; height = 14; borderRadius = '2px';
      }
      
      // Random angle and velocity for burst effect
      const angle = (Math.random() * Math.PI * 2);
      const velocity = 200 + Math.random() * 300;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity - 200; // Bias upward
      
      // Set styles
      confetti.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: ${width}px;
        height: ${height}px;
        background: ${color};
        border-radius: ${borderRadius};
        box-shadow: 0 0 8px ${color}, 0 0 12px ${color};
        pointer-events: none;
        z-index: 10000;
      `;
      
      container.appendChild(confetti);
      
      // Animate with JavaScript for reliability
      let posX = 0;
      let posY = 0;
      let velX = vx;
      let velY = vy;
      let rotation = 0;
      let rotationSpeed = (Math.random() - 0.5) * 20;
      let opacity = 1;
      let scale = 1;
      const gravity = 800;
      const friction = 0.98;
      let startTime = performance.now();
      const duration = 2000 + Math.random() * 1000;
      
      function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const dt = 0.016; // ~60fps
        
        // Physics
        velY += gravity * dt;
        velX *= friction;
        posX += velX * dt;
        posY += velY * dt;
        rotation += rotationSpeed;
        
        // Fade out
        const progress = elapsed / duration;
        opacity = Math.max(0, 1 - progress);
        scale = 1 - progress * 0.3;
        
        confetti.style.transform = `translate(${posX}px, ${posY}px) rotate(${rotation}deg) scale(${scale})`;
        confetti.style.opacity = opacity;
        
        if (elapsed < duration && opacity > 0) {
          requestAnimationFrame(animate);
        } else {
          confetti.remove();
        }
      }
      
      // Start animation with slight delay for burst effect
      setTimeout(() => requestAnimationFrame(animate), Math.random() * 50);
    }
    
    // Cleanup container after all animations
    setTimeout(() => {
      if (container.parentNode) {
        container.remove();
      }
    }, 4000);
  }
}

