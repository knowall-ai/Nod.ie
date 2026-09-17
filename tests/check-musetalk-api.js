const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkMuseTalkAPI() {
    console.log('Checking MuseTalk API...\n');
    
    try {
        const response = await fetch('http://localhost:8765/health');
        const config = await response.json();
        
        console.log('Version:', config.version);
        console.log('Mode:', config.mode);
        console.log('\nAvailable functions:');
        
        config.dependencies.forEach((dep, idx) => {
            console.log(`\n${idx}. ${dep.api_name || 'Function ' + idx}`);
            console.log('   Inputs:', dep.inputs);
            console.log('   Outputs:', dep.outputs);
            if (dep.backend_fn) console.log('   Backend function: yes');
        });
        
        // Look for the inference function
        const inferenceIdx = config.dependencies.findIndex(dep => 
            dep.api_name === 'inference' || dep.fn_index === 1
        );
        
        if (inferenceIdx >= 0) {
            console.log('\n✅ Found inference function at index:', inferenceIdx);
            const inf = config.dependencies[inferenceIdx];
            console.log('Details:', JSON.stringify(inf, null, 2));
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

checkMuseTalkAPI();