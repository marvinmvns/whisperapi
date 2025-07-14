#!/usr/bin/env node

const SystemValidator = require('../src/utils/systemValidator');

async function main() {
  console.log('🔍 Starting system validation...\n');
  
  const validator = new SystemValidator();
  
  try {
    const result = await validator.validateSystem();
    
    console.log('\n' + validator.getValidationReport());
    
    if (result.success) {
      console.log('🎉 System validation completed successfully!');
      console.log('✅ The system is ready to run the WhisperAPI application.');
      process.exit(0);
    } else {
      console.log('❌ System validation failed!');
      console.log('Please fix the issues above before running the application.');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 System validation error:', error.message);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { main };